#!/usr/bin/env python3
"""The build loop: builds ready features in parallel, one branch and one PR per
feature, and merges each PR itself once it is green. See DESIGN.md section 10.

  loop.py start [--lanes 3] [--budget 10] [--milestone M1] [--foreground]
  loop.py status [--json]          what is running, PRs, cost, questions waiting
  loop.py answer F012 "text"       answer a question; the feature goes back in the queue (a held PR gets a fix)
  loop.py drop L-1f2e3d "why"      stop waiting on a job for good (a rule proposal already done, a feature dropped)
  loop.py stop [--now]             stop taking work (finish what runs), or stop at once
  loop.py budget M1 20             set a milestone's budget (spent across runs); also start --milestone-budget M1=20
  loop.py events [--follow]        one line per event, for the /build skill's monitor

A feature goes queued -> building -> review -> (fixing) -> ci -> (waiting on its
base PR) -> merging -> merged. Stages that run Claude (building, review, fixing)
take one of the lanes; waiting on CI or a merge takes none. A PR merges (squash)
only when GitHub CI is green, the verifier left fresh PASS evidence, and the
reviewer found no [bug]. A feature that depends on one whose PR is still open is
built on that branch, and its PR is rebased onto main once the first one merges.
If main's CI fails after a merge, the loop opens and merges a revert, and asks.

Before the first feature of a milestone, a design job (D-<M>, `/design <M>`) writes
docs/design/<M>.md and has the architect approve it; it goes straight to CI, and the
milestone's features (bugs excepted) build on its branch until it merges.

A failure of the same kind seen twice or more (failures.jsonl) gets a rule job
(L-<hash>, `/learn`): a PR that may change only docs/golden-principles.md and the
reviewer's checklist, merged once CI is green. A rule that needs more (a lint, hook or
gate) is proposed to the human instead.

State lives in <git common dir>/harness-loop/ (state.json, events.log, loop.log,
sessions/<id>-<attempt>.log with each Claude session's full output, history.jsonl with
one summary per run, failures.jsonl with every failure by kind, budgets.json);
worktrees in ../<repo>-loop/<id>. CLAUDE_BIN and GH_BIN override the binaries,
LOOP_POLL the polling interval in seconds.
"""
import argparse
import datetime
import hashlib
import http.server
import json
import os
import plistlib
import re
import shutil
import signal
import socket
import socketserver
import subprocess
import sys
import threading
import time
import zoneinfo
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backlog  # noqa: E402
import ci_log  # noqa: E402
import health  # noqa: E402
import metrics  # noqa: E402
import notify  # noqa: E402
import owner  # noqa: E402
import runner  # noqa: E402

CLAUDE = os.environ.get("CLAUDE_BIN", "claude")
GH = os.environ.get("GH_BIN", "gh")
POLL = float(os.environ.get("LOOP_POLL", "20"))
LANE_STAGES = {"building", "review", "fixing"}
WAITING_HUMAN = {"needs_human", "held", "failed", "reverted"}
DONE = {"merged", "dropped"}
GIT_LOCK = threading.Lock()
PORT_LOCK = threading.Lock()
MAIN_GRACE = float(os.environ.get("LOOP_MAIN_GRACE", "300"))  # seconds for GitHub to start main's CI
# Paths whose changes get the security-reviewer too: auth, data access, migrations, API routes.
SENSITIVE = re.compile(r"(^|/)(auth|session|middleware|api|migrations|supabase|db|database|policies)(/|\.|$)|\.sql$", re.I)
# ...but not tests, docs or the harness's own files, which change no access rule.
NOT_SENSITIVE = re.compile(r"^(harness|e2e|tests?|docs)/|\.(spec|test)\.[cm]?[jt]sx?$|\.md$")
DOCS = re.compile(r"\.md$|^docs/")
# Errors that mean GitHub or the network was briefly unreachable: the step is tried again, not handed to the human.
CMD_TIMEOUT = float(os.environ.get("LOOP_CMD_TIMEOUT", "300"))  # seconds for one git or gh command
TRANSIENT = re.compile(r"could not resolve host|unable to access|error connecting to|connection (timed out|refused|reset|closed)"
                       r"|operation timed out|ssl connection timeout|tls handshake|i/o timeout|http 5\d\d|returned error: 5\d\d"
                       r"|no such host|network is unreachable|temporary failure in name resolution|nodename nor servname"
                       r"|unexpected eof|remote end hung up", re.I)
# Offline (GitHub or the network unreachable) or Claude's API unreachable: the loop waits, and stops only after this long.
OFFLINE_MAX = float(os.environ.get("LOOP_OFFLINE_MAX", str(12 * 3600)))
# Claude's API, not the work: "API Error: Connection error", a 5xx, overloaded. Paused like the usage limit, never an attempt.
API_DOWN = re.compile(r"API Error: (Connection error|Can't reach the API|Request timed out|5\d\d\b)|overloaded_error"
                      r"|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|fetch failed", re.I)
API_PROBE = os.environ.get("LOOP_API_PROBE", "api.anthropic.com:443")  # empty: no probe (tests)
INFRA_PAUSE = float(os.environ.get("LOOP_LIMIT_PAUSE") or 300)  # first wait when the API is down; then twice, 4 and 6 times as long
# A session longer than this is stuck (the longest of two real trials took 22 minutes): its process group is killed.
SESSION_TIMEOUT = float(os.environ.get("LOOP_SESSION_TIMEOUT", str(90 * 60)))
STATE_SCHEMA = 2  # state.json's layout; load_state() brings an older one up to date
COMMENT_POLL = float(os.environ.get("LOOP_COMMENT_POLL", "120"))  # seconds between reads of the owner's PR comments
SAMPLE_PUSHES = 3  # owner checks pushed per day; the rest wait in the digest
RUNNER_EVERY = float(os.environ.get("LOOP_RUNNER_EVERY", "300"))  # seconds between looks at a self-hosted runner
# Sandboxed sessions (LOOP_SANDBOX=1; the default once a real trial ran with it): Bash runs in Claude Code's
# sandbox (harness/loop-settings.json plus stack.json's "sandbox"), the session's environment keeps only these
# variables (no GH_TOKEN, cloud keys or other tokens), review and fix sessions cannot fetch the web, and the
# browser may open only the lane's own app.
SANDBOX = os.environ.get("LOOP_SANDBOX") == "1"
ENV_KEEP = re.compile(r"^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_\w+|TERM|COLORTERM|TMPDIR|TZ|XDG_\w+|ANTHROPIC_\w+"
                      r"|CLAUDE_\w+|NODE_OPTIONS|NVM_\w+|PORT|HARNESS_\w+|GIT_(AUTHOR|COMMITTER)_\w+"
                      + (f"|{os.environ['LOOP_ENV_KEEP']}" if os.environ.get("LOOP_ENV_KEEP") else "") + ")$")
# Caps per session stage (the largest of two real trials: review $0.50, fix $1.75) and per feature in all.
STAGE_CAPS = {"review": float(os.environ.get("LOOP_REVIEW_CAP", "0.75")), "fixing": float(os.environ.get("LOOP_FIX_CAP", "2.0"))}
FEATURE_ID = re.compile(r"^[FB]\d+$")
FEATURE_FLOOR = 5.0  # a feature may spend max($5, 3 x the median of recent features) before it asks
PRIOR_COST = {"web": 4.0, "api": 1.1}  # dollars per feature before a project has its own history (the trials)
DESIGN_COST = 2.5  # a milestone's design doc
FIX_SONNET = os.environ.get("LOOP_FIX_SONNET") == "1"  # a first fix of an S/M feature on the default model (trial)
OPT_KEYS = ("lanes", "budget", "milestone", "session_budget", "model", "large_model", "retries", "port_base")
MAX_RESUMES = 3  # a run that keeps dying is stopped, not restarted forever
# No new Claude session while the machine is overloaded (CI and merges go on): load per CPU, free disk.
MAX_LOAD = float(os.environ.get("LOOP_MAX_LOAD", "1.5"))
MIN_DISK_GB = 10
PROBE_EVERY = float(os.environ.get("LOOP_PROBE_EVERY", "300"))  # seconds between runs of stack.json's probes
PROBE_MAX = float(os.environ.get("LOOP_PROBE_MAX", "1800"))  # a probe failing this long stops the run
RUNNER_RESTART_GAP = float(os.environ.get("LOOP_RUNNER_RESTART_GAP", "600"))  # seconds between two restarts
REVIEW_LINE = re.compile(r"\[(bug|ux|note|test|dead|duplicate|principle-\d+)\]")  # a finding line of a review
# The account's Claude usage limit: not the job's fault. The loop pauses until it resets and keeps the job.
LIMIT = re.compile(r"hit your (\w+[- ])?limit|usage limit (reached|exceeded)|limit will reset|resets? (at )?\d{1,2}(:\d\d)?\s*[ap]m", re.I)
LIMIT_PAUSE = os.environ.get("LOOP_LIMIT_PAUSE")  # seconds to pause instead of until the reset (tests)
# The least a Claude session may start with. A real run kept starting sessions with a few cents left;
# each was cut off at once and counted as a failed attempt, until the feature was given up.
MIN_SESSION = float(os.environ.get("LOOP_MIN_SESSION", "1.0"))
MAX_ERRORS = int(os.environ.get("LOOP_MAX_ERRORS", "30"))  # ticks in a row that may fail (network) before stopping


# --- small helpers ----------------------------------------------------------------

def now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def run(cmd, cwd=None, env=None, check=False, input=None, timeout=None):
    # A git fetch once hung for 71 minutes when the network dropped mid-transfer, and froze the loop. The
    # timeout must end the whole process group: subprocess.run(timeout=) kills only git itself, while its
    # git-remote-https child keeps the output pipe open, so the wait went on for two more hours.
    proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=subprocess.PIPE if input is not None else None,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        out, err = proc.communicate(input, timeout=timeout or CMD_TIMEOUT)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.communicate()
        raise RuntimeError(f"{' '.join(cmd[:3])} operation timed out after {timeout or CMD_TIMEOUT:.0f}s")
    r = subprocess.CompletedProcess(cmd, proc.returncode, out, err)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:3])} failed: {(r.stderr or r.stdout).strip()[-400:]}")
    return r


def git(*args, cwd=None, check=True):
    return run(["git", *args], cwd=cwd, check=check)


def gh(*args, cwd=None, check=True):
    return run([GH, *args], cwd=cwd, check=check)


def kill_group(proc, grace=10):
    """End a process started with start_new_session and every process of its group."""
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        proc.wait(grace)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(proc.pid, signal.SIGKILL)  # whatever of the group ignored the TERM
    except (ProcessLookupError, PermissionError):
        pass


def online():
    """GitHub answers (gh, so it goes the way every other call goes)."""
    try:
        return run([GH, "api", "rate_limit", "--jq", ".rate.remaining"], timeout=30).returncode == 0
    except (RuntimeError, OSError):
        return False


def api_reachable():
    if not API_PROBE:
        return True
    host, _, port = API_PROBE.rpartition(":")
    try:
        socket.create_connection((host, int(port)), timeout=5).close()
        return True
    except OSError:
        return False


def port_free(port):
    for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET, "0.0.0.0"), (socket.AF_INET6, "::")):
        try:
            s = socket.socket(family, socket.SOCK_STREAM)
        except OSError:
            continue
        try:
            s.bind((host, port))
        except OSError as e:
            if e.errno == 48 or e.errno == 98:  # EADDRINUSE on macOS / Linux
                return False
        finally:
            s.close()
    return True


def free_port(start, taken=()):
    p = start
    while p in taken or not port_free(p):
        p += 1
    return p


def stop_processes_in(folder):
    """Stop what a session left running inside its worktree (dev servers, browsers)."""
    out = run(["lsof", "-a", "-d", "cwd", "-Fpn"]).stdout
    pid, mine = None, []
    for line in out.splitlines():
        if line.startswith("p"):
            pid = line[1:]
        elif line.startswith("n") and (line[1:] + "/").startswith(str(folder) + "/") and pid != str(os.getpid()):
            mine.append(int(pid))
    for p in mine:
        try:
            os.kill(p, signal.SIGTERM)
        except OSError:
            pass


def limit_resume(text, now_ts=None):
    """When a usage limit message ("... resets 11pm (Asia/Saigon)") lifts, as a timestamp; else in 30 minutes."""
    now_ts = time.time() if now_ts is None else now_ts
    if LIMIT_PAUSE:
        return now_ts + float(LIMIT_PAUSE)
    m = re.search(r"resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)?\s*(?:\(([^)]+)\))?", text, re.I)
    if not m:
        return now_ts + 1800
    hour, minute, half, zone = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").lower(), m.group(4)
    hour = hour % 12 + (12 if half == "pm" else 0) if half else hour
    try:
        tz = zoneinfo.ZoneInfo(zone) if zone else None
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        tz = None
    here = datetime.datetime.fromtimestamp(now_ts, tz)
    at = here.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if at <= here:
        at += datetime.timedelta(days=1)
    return at.timestamp() + 60  # a minute of slack after the reset


# --- the loop -----------------------------------------------------------------------

class Loop:
    def __init__(self, root, opts):
        self.root = Path(root)
        self.opts = opts
        self.home = Path(git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=root).stdout.strip()) / "harness-loop"
        self.home.mkdir(exist_ok=True)
        self.trees = self.root.parent / f"{self.root.name}-loop"
        self.state = self.load_state()
        self.threads = {}  # feature id -> (thread, result holder)
        self.procs = set()
        self.caps = {}  # feature id -> --max-budget-usd of its running session, held until its cost is counted
        self.stopping = False
        self.busy = None  # why the machine takes no new session right now (machine_busy), else None
        self.main_ci_since = {}
        # What the stack needs (harness/stack.json, from the preset): how features are verified, tools to probe.
        try:
            self.stack = json.loads((self.root / "harness/stack.json").read_text())
        except (OSError, ValueError):
            self.stack = {}

    # state -------------------------------------------------------------------------
    def load_state(self):
        path = self.home / "state.json"
        state = json.loads(path.read_text()) if path.exists() else {}
        if state.get("schema", 1) > STATE_SCHEMA:
            raise SystemExit(f"{path} was written by a newer kit (schema {state['schema']}); upgrade harness/loop.py")
        state["schema"] = STATE_SCHEMA  # 1 -> 2 adds fields only, each defaulted where it is read
        state.setdefault("jobs", {})
        for job in state["jobs"].values():  # resumed after a crash: lane work restarts
            if job["stage"] in ("building", "fixing", "review") and job.get("worktree") and Path(job["worktree"]).exists():
                stop_processes_in(job["worktree"])  # sessions orphaned by the crash
            if job["stage"] == "building":
                job["stage"] = "queued"
            elif job["stage"] == "fixing":
                job["stage"] = "review"
        state.setdefault("main_red", False)  # a red main stays red across restarts
        state.setdefault("milestone_spent", {})  # across runs, like the budgets
        state.setdefault("repeated", {})
        state["milestone_over"] = {}
        state["ci_blocked"] = False  # GitHub Actions starting no jobs; checked again each run
        state.pop("ci_stalled", None)  # the runner gave up on this run: a new run tries it again
        state["runner_restarts"] = []
        if getattr(self.opts, "resuming", False):  # the same run goes on: its start, spend and budget stay
            state["resumes"] = state.get("resumes", 0) + 1
            state.pop("crashed", None)
            state.update(running=True, stop_reason="", pid=os.getpid())
            return state
        state.update(started=now(), spent=0.0, cut_off=[], budget=self.opts.budget, lanes=self.opts.lanes,
                     milestone=self.opts.milestone, running=True, stop_reason="", pid=os.getpid(), resumes=0,
                     opts={k: getattr(self.opts, k) for k in OPT_KEYS})
        state.pop("crashed", None)
        return state

    def save(self):
        self.state["updated"] = now()
        tmp = self.home / "state.json.tmp"
        tmp.write_text(json.dumps(self.state, indent=2))
        tmp.replace(self.home / "state.json")

    def event(self, fid, text):
        line = f"{now()}  {fid:<6} {text}"
        with (self.home / "events.log").open("a") as f:
            f.write(line + "\n")
        print(line, flush=True)

    def job(self, fid):
        return self.state["jobs"].get(fid)

    def set_stage(self, job, stage, note=None, question=None):
        job["stage"], job["updated"] = stage, now()
        if note is not None:
            job["note"] = note
        job["question"] = question
        self.event(job["id"], f"{stage}" + (f": {note}" if note else ""))
        if stage in WAITING_HUMAN and question:
            key = f"ask:{job['id']}:{hashlib.sha1(question.encode()).hexdigest()[:8]}"
            detail = (notify.config(self.home) or {}).get("detail")
            self.push(key, f"{job['id']} needs you", question if detail else f"{job.get('title', '')}: {job.get('note') or stage}",
                      priority=4, click=job.get("pr_url"))
            try:
                self.ask_on_github(job, key)
            except Exception as e:  # a comment that did not go out never stops the stage change; the push did
                with (self.home / "loop.log").open("a") as f:
                    f.write(f"{now()} {job['id']} question not posted on GitHub: {e!r}\n")

    # the owner: pushes, questions on GitHub, their comments ------------------------------
    def push(self, key, title, message, priority=3, click=None, wait=False):
        """One push per key, ever (state['notified']): a restart or a second tick never repeats it."""
        sent = self.state.setdefault("notified", {})
        if key in sent:
            return
        sent[key] = now()
        for old in list(sent)[:-300]:
            sent.pop(old)
        notify.send(self.home, title, message, priority=priority, click=click, wait=wait)

    def owner(self):
        if not self.state.get("owner"):
            self.state["owner"] = gh("api", "user", "--jq", ".login", cwd=self.root, check=False).stdout.strip()
        return self.state["owner"]

    def comment(self, number, body):
        """Post on a PR or issue; remember the comment's id so the loop never reads its own words back."""
        url = gh("pr" if self.is_pr(number) else "issue", "comment", str(number), "--body", body, cwd=self.root,
                 check=False).stdout.strip()
        m = re.search(r"issuecomment-(\d+)", url)
        if m:
            mine = self.state.setdefault("own_comments", [])
            mine.append(int(m.group(1)))
            del mine[:-300]

    def is_pr(self, number):
        return any(j.get("pr") == number for j in self.state["jobs"].values())

    def ask_on_github(self, job, key):
        """The question goes on the job's PR (or its mirrored issue) once, so the owner can answer from the phone."""
        asked = self.state.setdefault("asked", {})
        if key in asked:
            return
        number = job.get("pr")
        if not number:
            found = gh("issue", "list", "--label", "harness", "--state", "open", "--search", f"[{job['id']}] in:title",
                       "--json", "number,title", cwd=self.root, check=False).stdout
            try:
                number = next((i["number"] for i in json.loads(found or "[]") if i["title"].startswith(f"[{job['id']}] ")), None)
            except ValueError:
                number = None
        if not number:
            return
        asked[key] = now()
        job["ask_on"], job["asked_at"] = number, datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.comment(number, f"**The build loop needs you** ({job['id']}): {job['question']}\n\n"
                             "Answer in a comment that starts with `/answer <what to do>`, or `/drop <why>` to stop "
                             f"working on it. Only comments by @{self.owner()} count.")

    def poll_comments(self):
        """Read the owner's commands on the PRs and issues where the loop asked something, or sampled a feature."""
        if time.time() - self.state.get("comments_polled", 0) < COMMENT_POLL:
            return
        self.state["comments_polled"] = time.time()
        targets = [(j["id"], j["ask_on"], j.get("asked_at")) for j in self.state["jobs"].values()
                   if j.get("ask_on") and j["stage"] in WAITING_HUMAN]
        week_ago = (datetime.datetime.now() - datetime.timedelta(days=7)).isoformat(timespec="seconds")
        targets += [(fid, sm["pr"], sm.get("since")) for fid, sm in self.state.get("samples", {}).items()
                    if sm.get("status") == "pending" and sm.get("at", "") >= week_ago]
        if not targets:
            return
        me, mine = self.owner(), set(self.state.get("own_comments", []))
        done = self.state.setdefault("comments_done", [])
        for fid, number, since in targets:
            out = gh("api", f"repos/{self.repo()}/issues/{number}/comments?per_page=100" + (f"&since={since}" if since else ""),
                     cwd=self.root, check=False).stdout
            try:
                comments = json.loads(out or "[]")
            except ValueError:
                continue
            for c in comments:
                cmd = owner.command(c.get("body"))
                if (not cmd or c.get("id") in done or c.get("id") in mine or not me
                        or (c.get("user") or {}).get("login") != me):
                    continue  # only the owner's commands, each once; never the loop's own comments
                done.append(c["id"])
                del done[:-500]
                self.apply_comment(fid, number, *cmd)
                gh("api", "-X", "POST", f"repos/{self.repo()}/issues/comments/{c['id']}/reactions", "-f", "content=+1",
                   cwd=self.root, check=False)

    def apply_comment(self, fid, number, verb, text):
        sample = self.state.get("samples", {}).get(fid)
        if verb in ("answer", "drop") and self.job(fid) and self.job(fid)["stage"] in WAITING_HUMAN:
            write_answer(self.home, fid, text or "(no text)", drop=verb == "drop")
            self.event(fid, f"{verb} from GitHub #{number}: {text[:120]}")
        elif verb == "ok" and sample:
            sample["status"] = "ok"
            self.event(fid, f"owner check: ok (#{number})")
        elif verb == "bug":
            with (self.home / "feedback.jsonl").open("a") as f:
                f.write(json.dumps({"at": now(), "id": fid, "pr": number, "text": text, "from": "github"}) + "\n")
            if sample:
                sample["status"] = "bug"
            self.event(fid, f"feedback from GitHub #{number}: {text[:120]} (sort it out in chat with /feedback)")

    def maybe_sample(self, job):
        """Some merged features go to the owner to check against what they meant. Never blocks a merge."""
        if job.get("kind") or job.get("revert_of") or not job.get("pr"):
            return
        f = self.main.get(job["id"], {})
        ms, seen = f.get("milestone"), self.state.setdefault("sampled_milestones", [])
        first_ui = bool(job.get("shots")) and ms not in seen
        if not (f.get("owner_check") or first_ui or int(hashlib.sha1(job["id"].encode()).hexdigest(), 16) % 4 == 0):
            return
        if first_ui:
            seen.append(ms)
        samples = self.state.setdefault("samples", {})
        sample = samples[job["id"]] = {"at": now(), "pr": job["pr"], "pr_url": job.get("pr_url"), "title": job["title"],
                                       "status": "pending",
                                       "since": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        self.comment(job["pr"], "**Owner check:** does this match what you meant? Comment `/ok`, or `/bug <what is off>`.")
        today = now()[:10]
        if sum(1 for x in samples.values() if x.get("pushed", "").startswith(today)) < SAMPLE_PUSHES:
            sample["pushed"] = now()
            self.push(f"sample:{job['id']}", f"Check {job['id']} against what you meant",
                      f"{job['title']}. Looks right? Comment /ok, or /bug <what is off>, on the PR.", click=job.get("pr_url"))

    def self_hosted(self):
        if "self_hosted" not in self.state:
            value = gh("api", f"repos/{self.repo()}/actions/variables/HARNESS_RUNS_ON", "--jq", ".value", cwd=self.root,
                       check=False).stdout
            self.state["self_hosted"] = "self-hosted" in value
        return self.state["self_hosted"]

    def watch_runner(self):
        """While CI is awaited, look at the self-hosted runner every few minutes; restart it if it is stuck
        and the owner allowed that (loop.py runner on), at most 3 times a run, 10 minutes apart."""
        waiting = any(j["stage"] in ("ci", "merging") or (j["stage"] == "merged" and not j.get("main_checked"))
                      for j in self.state["jobs"].values())
        if not waiting or time.time() - self.state.get("runner_checked", 0) < RUNNER_EVERY or not self.self_hosted():
            return
        self.state["runner_checked"] = time.time()
        why = runner.problem(lambda *a: gh(*a, cwd=self.root, check=False), self.repo())
        if not why:
            if self.state.pop("runner_problem", None):
                self.event("loop", "runner: takes jobs again")
            return
        first = self.state.get("runner_problem") != why
        self.state["runner_problem"] = why
        consent = (self.home / "runner.json").exists() and json.loads((self.home / "runner.json").read_text()).get("restart")
        plists, restarts = runner.services(self.repo()), self.state["runner_restarts"]
        if not consent or not plists:
            if first:
                self.event("loop", f"runner: {why}; restart it (svc.sh stop, then start)"
                                   + (", or let the loop do it: loop.py runner on" if plists else ""))
                self.push(f"runner:{self.state['started']}", "CI runner stuck", f"{why}. Restart it, or allow the loop "
                                                                                 "to: loop.py runner on.", priority=4)
            return
        if len(restarts) >= 3:
            if not self.state.get("ci_stalled"):
                self.state["ci_stalled"] = why
                self.event("loop", f"ci stalled: the runner is still stuck after 3 restarts ({why}); nothing new starts")
                self.push(f"stalled:{self.state['started']}", "CI runner still stuck",
                          f"{why}, after 3 restarts. Check the Mac and the runner.", priority=5)
            return
        if restarts and time.time() - restarts[-1] < RUNNER_RESTART_GAP:
            return
        hard = bool(restarts)
        for plist in plists:
            runner.restart(plist, hard=hard)
        restarts.append(time.time())
        self.event("loop", f"runner: {why}; restarted its service ({'bootout and bootstrap' if hard else 'kickstart'})")

    def check_milestones(self, wait=False):
        """Announce a milestone once all its features pass on main (the first look only records what is done)."""
        by_ms = {}
        for f in self.main.values():
            by_ms.setdefault(f.get("milestone"), []).append(f.get("status") == "passing")
        done = {ms for ms, ok in by_ms.items() if ms and all(ok)}
        if "milestones_done" not in self.state:
            self.state["milestones_done"] = sorted(done)
            return
        for ms in sorted(done - set(self.state["milestones_done"])):
            self.state["milestones_done"].append(ms)
            self.event(ms, f"milestone: {ms} done; run /release {ms} for staging and its owner check")
            self.push(f"milestone:{ms}", f"Milestone {ms} done", f"Every feature of {ms} is merged. Next: /release {ms}.",
                      wait=wait)

    # cost, failures, budgets --------------------------------------------------------------
    def milestone_of(self, job):
        fid = job.get("revert_of") or job["id"]
        return job.get("milestone") or self.main.get(fid, {}).get("milestone") if hasattr(self, "main") else None

    def budgets(self):
        f = self.home / "budgets.json"
        return json.loads(f.read_text()) if f.exists() else {}

    def over_budget(self, ms):
        cap = self.budgets().get(ms)
        return cap is not None and self.state["milestone_spent"].get(ms, 0) >= cap

    def failure(self, job, kind, detail=None):
        """Record a failure by kind; a kind seen twice or more (across runs) is a pattern to fix at its root.
        detail is what a rule job reads about this occurrence (the kind itself when not given)."""
        if job.get("kind") == "rule":
            return  # a failing rule job never spawns rules about rules
        detail = (detail or kind)[:600]
        kind = re.sub(r"\b[FBD]-?\d+\b|\bR-\S+", "<id>", kind)
        kind = re.sub(r"\S*[/\\]\S*|\S+\.(?:tsx?|jsx?|py|sql|md|json|css|png)\b", "<path>", kind)
        kind = re.sub(r"\d+", "<n>", kind).strip().lower()[:100]
        with (self.home / "failures.jsonl").open("a") as f:
            f.write(json.dumps({"at": now(), "id": job["id"], "kind": kind, "detail": detail}) + "\n")
        count = sum(1 for line in (self.home / "failures.jsonl").read_text().splitlines()
                    if json.loads(line)["kind"] == kind)
        if count >= 2:
            self.state["repeated"][kind] = count
            self.event(job["id"], f"repeated: {kind} x{count}")

    # backlog on main ----------------------------------------------------------------
    def refresh_main(self):
        with GIT_LOCK:
            git("fetch", "-q", "--prune", "origin", cwd=self.root)
            sha = git("rev-parse", "origin/main", cwd=self.root).stdout.strip()
            if git("status", "--porcelain", cwd=self.root).stdout.strip() == "":
                git("merge", "-q", "--ff-only", "origin/main", cwd=self.root, check=False)
        if sha != self.state.get("main_sha") or not hasattr(self, "main"):
            self.state["main_sha"] = sha
            self.main = {f["id"]: f for f in backlog.read(self.root, "origin/main")}
            docs = git("ls-tree", "--name-only", "origin/main", "docs/design/", cwd=self.root).stdout.split()
            self.designed = {Path(d).stem for d in docs if d.endswith(".md")}
        return sha

    def ready(self):
        """Features to build next, in order, each with the branch to build on."""
        if not hasattr(self, "main"):
            return []
        out = []
        todo = sorted(self.main.values(), key=lambda f: (f.get("type") != "bug", f["priority"]))
        # Only the first milestone still to design gets a job: a later design builds on the earlier one on main.
        for ms in list(dict.fromkeys(f.get("milestone") for f in todo if self.needs_design(f)))[:1]:
            job = self.job(f"D-{ms}")
            if (not job or job["stage"] == "queued") and not self.over_budget(ms):
                out.append(({"id": f"D-{ms}", "title": f"Design {ms}", "kind": "design", "milestone": ms}, "main"))
        # Each repeated failure kind gets one rule job, one at a time: they all edit the same two files,
        # so a second one built beside the first conflicts when the first merges.
        rule_busy = any(j.get("kind") == "rule" and j["stage"] not in DONE | WAITING_HUMAN | {"queued"}
                        for j in self.state["jobs"].values())
        for kind in self.state["repeated"]:
            rid = "L-" + hashlib.sha1(kind.encode()).hexdigest()[:6]
            job = self.job(rid)
            if not rule_busy and (not job or job["stage"] == "queued"):
                out.append(({"id": rid, "title": f"Rule: {kind}"[:70], "kind": "rule", "rule_for": kind}, "main"))
                break
        for f in todo:
            if self.opts.milestone and f.get("milestone") != self.opts.milestone:
                continue
            job = self.job(f["id"])
            if job and job["stage"] != "queued":
                continue
            if f["status"] == "passing":
                continue
            if f["status"] == "blocked" and not (job and job["stage"] == "queued"):
                continue
            if f.get("type") != "bug" and self.over_budget(f.get("milestone")):
                continue  # bugs still run; the rest of the milestone waits for a new budget
            base, ok = "main", True
            if self.needs_design(f):  # build on the milestone's design PR, never before it exists
                dj = self.job(f"D-{f.get('milestone')}")
                if dj and dj["stage"] in ("ci", "waiting_base", "merging"):
                    base = dj["branch"]
                else:
                    ok = False
            for dep in f.get("depends_on", []):
                if self.main.get(dep, {}).get("status") == "passing":
                    continue
                dj = self.job(dep)
                if dj and dj["stage"] in ("review", "fixing", "ci", "waiting_base", "merging") and base == "main":
                    base = dj["branch"]  # stack on the open PR
                else:
                    ok = False
            if ok:
                out.append((f, base))
        return out

    def needs_design(self, f):
        return (f.get("type") != "bug" and f.get("status") != "passing" and f.get("milestone")
                and f["milestone"] not in self.designed
                and not (self.opts.milestone and f["milestone"] != self.opts.milestone))

    # lanes ---------------------------------------------------------------------------
    def lanes_busy(self):
        # A lane is free only once its result is collected: a finished but uncollected
        # session still holds its lane and its cost has not been counted yet.
        return len(self.threads)

    def free_budget(self):
        """What the run may still spend: the budget less what is spent and what running sessions may spend."""
        return self.state["budget"] - self.state["spent"] - sum(self.caps.values())

    def can_start(self):
        """Enough budget left to start a Claude session worth having, on a machine that can take it."""
        return self.free_budget() >= MIN_SESSION and not self.busy

    def machine_busy(self):
        """Why no new session should start (load, critical memory, disk, a failing probe), else None."""
        h = health.snapshot(self.state, self.root)
        if h["load"] is not None and h["cpus"] and h["load"] / h["cpus"] > MAX_LOAD:
            return f"load {h['load']} on {h['cpus']} CPUs"
        if h["memory"] == "critical":
            return "memory pressure is critical"
        if h["disk_free_gb"] < MIN_DISK_GB:
            return f"only {h['disk_free_gb']} GB of disk free"
        if time.time() - self.state.get("probed", 0) >= PROBE_EVERY:
            self.state["probed"] = time.time()
            failed = None
            for cmd in self.stack.get("probes", []):
                try:
                    ok = run(cmd, cwd=self.root, timeout=20).returncode == 0
                except (RuntimeError, OSError):
                    ok = False
                if not ok:
                    failed = " ".join(cmd)
                    break
            self.state["probe_failing"] = failed
            if failed:
                self.state.setdefault("probe_since", time.time())
            else:
                self.state.pop("probe_since", None)
        if self.state.get("probe_failing"):
            down = time.time() - self.state["probe_since"]
            if down > PROBE_MAX:
                self.state["stop_now"] = True
                self.state["stop_reason"] = f"`{self.state['probe_failing']}` has failed for {down / 60:.0f} min"
            return f"`{self.state['probe_failing']}` fails (is it running?)"
        return None

    def low_budget(self):
        return self.state["budget"] - self.state["spent"] < MIN_SESSION

    def full_cap(self, stage):
        return min(self.opts.session_budget, STAGE_CAPS.get(stage, self.opts.session_budget))

    def starved(self, job, res):
        """The session was cut off by a cap the run's dwindling budget set, not by the work itself."""
        return (res.get("subtype") == "error_max_budget_usd"
                and job.get("last_cap", 0) < self.full_cap(job.get("cap_stage", "building")) - 0.005)

    def recent_costs(self):
        done = sorted((j for j in self.state["jobs"].values() if FEATURE_ID.match(j["id"]) and j["stage"] == "merged"),
                      key=lambda j: j.get("merged_at", ""))[-30:]
        return [j.get("cost", 0) for j in done]

    def typical_cost(self):
        costs = self.recent_costs()
        if len(costs) < 5:
            return PRIOR_COST.get(self.stack.get("kind"), 2.5)
        return metrics.quantile(costs, 0.5)

    def feature_budget(self, job):
        return max(FEATURE_FLOOR, 3 * self.typical_cost()) + job.get("budget_extra", 0)

    def over_feature_budget(self, job):
        """A feature that spent more than its share stops and asks before it spends more (real trial: $15 on one)."""
        if not FEATURE_ID.match(job["id"]) or job.get("cost", 0) < self.feature_budget(job):
            return False
        job["budget_held"] = job["stage"]
        self.set_stage(job, "held", note=f"spent ${job['cost']:.2f}, over its budget of ${self.feature_budget(job):.2f}",
                       question=f"{job['id']} has spent ${job['cost']:.2f}, more than its budget (${self.feature_budget(job):.2f}: "
                                "three times what a feature here usually costs). Answer \"$5 more\" (or any amount) to go "
                                "on, or drop it.")
        return True

    def launch(self, job, work):
        if self.over_feature_budget(job):
            return
        holder = {}
        # Each lane gets its own share, so lanes together stay within the budget (a session ending at
        # once with nothing left is still capped at a cent, as before).
        self.caps[job["id"]] = round(min(self.full_cap(job["stage"]), max(self.free_budget(), 0.01)), 2)
        job["last_cap"], job["cap_stage"] = self.caps[job["id"]], job["stage"]

        def target():
            began = time.time()
            try:
                holder["result"] = work(job)
            except Exception as e:  # a crashed lane must not take the loop down
                holder["result"] = {"error": str(e)}
            holder["seconds"] = round(time.time() - began)
        t = threading.Thread(target=target, daemon=True)
        self.threads[job["id"]] = (t, holder, job["stage"])  # the result is for this stage, whatever happens meanwhile
        t.start()

    def claude(self, job, prompt, model, turns=200, lane_note=True):
        """One headless Claude run in the job's worktree. Returns (cost, subtype, text)."""
        cap = self.caps[job["id"]]
        with PORT_LOCK:
            port = free_port(self.opts.port_base + 1, taken={j.get("port") for j in self.state["jobs"].values()})
            job["port"] = port
        env = {**os.environ, "PORT": str(port), "HARNESS_LANE": job["id"], "HARNESS_AUTONOMOUS": "1",
               "HARNESS_STAGE": job["stage"]}
        if lane_note:
            prompt += (f"\n\n(This lane's app runs on http://localhost:{port}: PORT is set, and ./init.sh and the "
                       "e2e tests use it. Never use port 3000 or another app's port.)")
        job["last_model"] = model
        cmd = (["nice", "-n", "10"] if shutil.which("nice") else []) + [CLAUDE, "-p", prompt, "--permission-mode", "auto", "--model", model, "--max-budget-usd", str(cap),
               "--max-turns", str(turns), "--output-format", "json", "--setting-sources",
               "project" if SANDBOX else "project,local", "--strict-mcp-config",
               "--exclude-dynamic-system-prompt-sections"]  # the same system prompt in every lane: cache hits
        browser = self.stack.get("verify", "browser") == "browser"  # an API is verified with curl: no browser
        if SANDBOX:
            env = {k: v for k, v in env.items() if ENV_KEEP.match(k) or k in self.stack.get("env_allow", [])}
            cmd += ["--settings", str(self.session_settings(job))]
            if job["stage"] in ("review", "fixing"):
                cmd += ["--disallowedTools", "WebFetch"]
        if browser:
            cmd += ["--mcp-config", str(self.session_mcp(job, port)) if SANDBOX else "harness/loop-mcp.json",
                    "--allowedTools", "mcp__playwright"]
        proc = subprocess.Popen(cmd, cwd=job["worktree"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, start_new_session=True)
        self.procs.add(proc)
        timed_out = False
        try:
            out, err = proc.communicate(timeout=SESSION_TIMEOUT)
        except subprocess.TimeoutExpired:
            timed_out = True
            kill_group(proc)
            stop_processes_in(job["worktree"])
            out, err = proc.communicate()
        self.procs.discard(proc)
        stop_processes_in(job["worktree"])
        log = self.home / "sessions" / f"{job['id']}-{job.get('attempts', 0) + 1}.log"
        log.parent.mkdir(exist_ok=True)
        with log.open("a") as f:  # every session of this attempt, in full
            f.write(f"=== {now()} {job['stage']} exit {proc.returncode}\n--- stdout\n{out}\n--- stderr\n{err}\n")
        if timed_out:
            with (self.home / "loop.log").open("a") as f:
                f.write(f"{now()} {job['id']} session ran over {SESSION_TIMEOUT / 60:.0f} min; killed\n")
            return 0.0, ("timeout" if online() else "infra"), ""  # with the network down, the network stalled it
        try:
            d = json.loads(out)
        except ValueError:
            tail = [x for x in err.splitlines() if x.strip() and not re.match(r"\s*(warning|ignoring)\b", x, re.I)][-5:]
            with (self.home / "loop.log").open("a") as f:
                f.write(f"{now()} {job['id']} claude gave no result (exit {proc.returncode}): "
                        f"{' | '.join(tail)[-800:] or 'no stderr'}; full output in {log}\n")
            if LIMIT.search(err):
                job["limit_message"] = tail[-1] if tail else "usage limit"
                return 0.0, "limit", ""
            if API_DOWN.search(err):
                job["infra_message"] = tail[-1] if tail else "API unreachable"
                return 0.0, "infra", ""
            return 0.0, "no-json", ""
        subtype = d.get("subtype", "unknown")
        usage = d.get("usage") or {}
        job["last_telemetry"] = {  # what the session did, for the scorecard: turns, tokens, cost by model
            "turns": d.get("num_turns"), "session_id": d.get("session_id"),
            "tokens": {"in": usage.get("input_tokens", 0), "out": usage.get("output_tokens", 0),
                       "cache_read": usage.get("cache_read_input_tokens", 0),
                       "cache_write": usage.get("cache_creation_input_tokens", 0)},
            "by_model": {m: round(u.get("costUSD", 0), 4) for m, u in (d.get("modelUsage") or {}).items()}}
        if d.get("is_error") and LIMIT.search(str(d.get("result") or "")):
            job["limit_message"] = str(d.get("result"))[:200]
            return float(d.get("total_cost_usd", 0)), "limit", ""
        if d.get("is_error") and API_DOWN.search(str(d.get("result") or "")):
            job["infra_message"] = str(d.get("result"))[:200]
            return float(d.get("total_cost_usd", 0)), "infra", ""
        if subtype == "success" and (d.get("is_error") or proc.returncode != 0):
            subtype = "error"  # seen with the network down: "success", is_error, and an API error as the result
        return float(d.get("total_cost_usd", 0)), subtype, str(d.get("result") or "")

    def session_settings(self, job):
        """The sandbox for one session: harness/loop-settings.json as main has it (never the branch's copy) and
        what the stack adds (stack.json "sandbox": allowUnixSockets, allowedDomains, excludedCommands)."""
        base = json.loads((self.root / "harness/loop-settings.json").read_text())
        box, extra = base.setdefault("sandbox", {}), self.stack.get("sandbox", {})
        net = box.setdefault("network", {})
        net["allowedDomains"] = net.get("allowedDomains", []) + extra.get("allowedDomains", [])
        if extra.get("allowUnixSockets"):
            net["allowUnixSockets"] = net.get("allowUnixSockets", []) + extra["allowUnixSockets"]
        if extra.get("excludedCommands"):
            box["excludedCommands"] = box.get("excludedCommands", []) + extra["excludedCommands"]
        f = self.home / "sandbox" / f"{job['id']}-{job['stage']}.json"
        f.parent.mkdir(exist_ok=True)
        f.write_text(json.dumps(base, indent=2))
        return f

    def session_mcp(self, job, port):
        """The browser for one session may open only this lane's app."""
        cfg = json.loads((self.root / "harness/loop-mcp.json").read_text())
        for server in cfg.get("mcpServers", {}).values():
            if any("playwright" in a for a in server.get("args", [])):
                server["args"] = server["args"] + ["--allowed-origins", f"http://localhost:{port};http://127.0.0.1:{port}"]
        f = self.home / "sandbox" / f"{job['id']}-{job['stage']}-mcp.json"
        f.parent.mkdir(exist_ok=True)
        f.write_text(json.dumps(cfg, indent=2))
        return f

    def model_for(self, job):
        f = self.main.get(job["id"], {})
        return self.opts.large_model if job.get("kind") or f.get("complexity") == "L" or job.get("attempts", 0) else self.opts.model

    # stage: building ----------------------------------------------------------------
    def start_build(self, f, base):
        fid = f["id"]
        job = self.job(fid) or {"id": fid, "attempts": 0, "fix_rounds": 0, "cost": 0.0, "answers": []}
        if f.get("kind") == "design":
            job.update(kind="design", milestone=f["milestone"])
        elif f.get("kind") == "rule":
            job.update(kind="rule", rule_for=f["rule_for"])
        job.setdefault("first_started", time.time())
        branch = {"design": f"agent/design-{job.get('milestone')}", "rule": f"agent/rule-{fid[2:]}"}.get(job.get("kind"), f"agent/{fid}")
        job.update(title=f["title"], branch=branch, base=base, worktree=str(self.trees / fid),
                   fix_rounds=0, pr=None, pr_url=None, started=now(), port=None, note=None, question=None,
                   merge_sha=None, main_checked=False, findings="")
        self.state["jobs"][fid] = job
        with GIT_LOCK:
            self.remove_worktree(job)
            git("fetch", "-q", "origin", cwd=self.root)  # a merge earlier in this tick moved main
            start = "origin/main" if base == "main" else base
            git("worktree", "add", "-q", "-B", job["branch"], job["worktree"], start, cwd=self.root)
            job["base_sha"] = git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()
        job["model"] = self.model_for(job)
        self.set_stage(job, "building", note=f"on {base} with {job['model']}")
        self.launch(job, self.work_build)

    def work_build(self, job):
        extra = " ".join(job.get("answers", []))
        kind = job.get("kind")
        command = (f"/design {job['milestone']}" if kind == "design" else self.rule_prompt(job) if kind == "rule"
                   else f"/next {job['id']}")
        prompt = command + (f" The human answered earlier questions: {extra}" if extra else "")
        if job.get("last_failure"):  # a retry knows why the last attempt failed, so it does not repeat it blind
            prompt += f" The previous attempt failed: {job['last_failure']}"
        cost, subtype, text = self.claude(job, prompt, job["model"])
        return {"cost": cost, "subtype": subtype, "text": text}

    def finish_build(self, job, res):
        wt = job["worktree"]
        if res.get("subtype") in ("no-json", "timeout") or res.get("error"):
            return self.retry(job, res.get("error") or ("the session ran over the time limit"
                                                        if res.get("subtype") == "timeout" else "Claude returned no result"))
        if self.starved(job, res):  # not the feature's fault: build it again with a full budget, no attempt used
            return self.set_stage(job, "queued", note=f"cut off by the run's budget (${job['last_cap']}); builds again")
        if git("status", "--porcelain", cwd=wt).stdout.strip():
            proof = Path(wt) / f"harness/evidence/design-{job.get('milestone')}.md"
            rejected = job.get("kind") == "design" and proof.exists() and "VERDICT: FAIL" in proof.read_text()
            why = ("the architect still failed the design after 3 rounds: "
                   + proof.read_text().split("PROBLEMS:", 1)[-1].strip()[:1500]) if rejected else \
                "the session left uncommitted work (stashed)"
            git("stash", "push", "-q", "-u", "-m", f"loop: uncommitted work from {job['id']}", cwd=wt)
            # A feature that committed "needs a human" and left a stray file (a screenshot, say) still needs one:
            # building it again would hit the same wall. Seen for real in a sandboxed web run.
            f = {} if job.get("kind") else next((x for x in backlog.read(wt) if x["id"] == job["id"]), {})
            if f.get("status") == "blocked" and f.get("blocked_reason") == "needs_human":
                return self.set_stage(job, "needs_human", note="needs you", question=f.get("notes") or "needs a decision")
            return self.retry(job, why)
        guard = run(["git", "show", f"{job['base_sha']}:harness/integrity.py"], cwd=wt).stdout or \
            (Path(wt) / "harness/integrity.py").read_text()
        check = self.guard(job, guard, job["base_sha"])
        if check.returncode != 0:
            git("update-ref", f"refs/harness/rejected/{job['id']}-{int(time.time())}", "HEAD", cwd=wt)
            git("reset", "-q", "--hard", job["base_sha"], cwd=wt)
            lines = check.stdout.strip().splitlines()
            protected = [ln.split(": ", 2)[1] for ln in lines if "a protected harness file" in ln]
            if protected and len(protected) == len(lines):  # not a mistake to retry: only a human changes these
                return self.set_stage(job, "needs_human", note="changed protected harness files",
                                      question=f"{job['id']} changed protected harness files ({', '.join(protected)}), "
                                               "which an agent may not. Answer how to build it without them, or change "
                                               "them yourself in a chat session first, then answer to build it again.")
            return self.retry(job, "integrity guard: " + lines[0])
        if job.get("kind") == "design":
            return self.finish_design(job, res)
        if job.get("kind") == "rule":
            return self.finish_rule(job, res)
        status = backlog.read(wt)
        f = next((x for x in status if x["id"] == job["id"]), {})
        if f.get("status") == "passing":
            shots = Path(wt) / f"harness/evidence/{job['id']}"
            job["shots"] = sorted(x.name for x in shots.glob("*.png")) if shots.is_dir() else []
            if not self.ensure_base(job):
                return
            self.open_pr(job)
            return self.set_stage(job, "review")
        if f.get("status") == "blocked" and f.get("blocked_reason") == "needs_human":
            return self.set_stage(job, "needs_human", note="needs you", question=f.get("notes") or "needs a decision")
        return self.retry(job, f.get("notes") or f"ended {f.get('status', 'unknown')}")

    def guard(self, job, source, base):
        """Run the integrity guard (the base commit's own copy, given as source) on the branch."""
        flags = ["--agent", *(["--rule"] if job.get("kind") == "rule" else [])]
        check = run([sys.executable, "-", "--base", base, "--head", "HEAD", *flags], cwd=job["worktree"], input=source)
        if "unrecognized arguments: --agent" in check.stderr:  # a base from before kit 5.0
            check = run([sys.executable, "-", "--base", base, "--head", "HEAD", *flags[1:]], cwd=job["worktree"],
                        input=source)
        return check

    def finish_design(self, job, res):
        doc = f"docs/design/{job['milestone']}.md"
        if git("diff", "--quiet", job["base_sha"], "HEAD", "--", doc, cwd=job["worktree"], check=False).returncode == 0:
            last = (res.get("text") or "").strip().splitlines()[-1:] or ["no design doc committed"]
            return self.retry(job, last[0][:300])
        self.open_pr(job)  # the integrity guard passed, so the architect approved this exact doc
        self.set_stage(job, "ci", note="architect: PASS")

    def rule_prompt(self, job):
        f = self.home / "failures.jsonl"
        seen = [json.loads(x) for x in (f.read_text().splitlines() if f.exists() else [])]
        examples = "\n".join(f"- {x['id']} ({x['at']}): {x.get('detail', x['kind'])}"
                              for x in seen if x["kind"] == job["rule_for"])[-3000:]
        return (f"/learn The build loop saw the same kind of failure again and again: \"{job['rule_for']}\". "
                f"Occurrences:\n{examples}\n(This is the loop: follow the skill's section for it.)")

    def finish_rule(self, job, res):
        if git("diff", "--quiet", job["base_sha"], "HEAD", cwd=job["worktree"], check=False).returncode == 0:
            text = (res.get("text") or "").strip()
            if "PROPOSE:" in text:  # needs more than a rule: a lint, hook or gate is the human's call
                return self.set_stage(job, "needs_human", note="proposes a harness change",
                                      question=f"Repeated failure \"{job['rule_for']}\": " + text.split("PROPOSE:", 1)[1].strip()[:800])
            return self.retry(job, (text.splitlines()[-1:] or ["no rule committed"])[0][:300])
        self.open_pr(job)  # the guard (--rule) allowed only the rule files
        self.set_stage(job, "ci", note="rule PR")

    def retry(self, job, why):
        self.failure(job, why)
        job["last_failure"] = why
        job["attempts"] = job.get("attempts", 0) + 1
        if job["attempts"] <= self.opts.retries:
            return self.set_stage(job, "queued", note=f"attempt {job['attempts']} failed: {why}; retrying")
        return self.set_stage(job, "failed", note=why,
                              question=f"{job['id']} failed {job['attempts']} times: {why}. How should it be done?")

    # PRs -------------------------------------------------------------------------------
    def repo(self):
        if "repo" not in self.state:
            self.state["repo"] = gh("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner",
                                    cwd=self.root).stdout.strip()
        return self.state["repo"]

    def pr_body(self, job, findings=""):
        wt, fid = Path(job["worktree"]), job["id"]
        if job.get("kind") == "rule":
            diff = git("diff", job["base_sha"], "HEAD", cwd=str(wt)).stdout[:4000]
            return (f"The same kind of failure kept happening: **{job['rule_for']}**. This PR adds a rule for it.\n\n"
                    f"```diff\n{diff}\n```\n\n---\nOpened by the harness loop from a repeated failure. It may change only "
                    "`docs/golden-principles.md` and the reviewer's checklist (CI enforces this), and merges once CI is green.\n")
        if job.get("kind") == "design":
            ms = job["milestone"]
            proof = wt / f"harness/evidence/design-{ms}.md"
            verdict = proof.read_text()[:3000] if proof.exists() else ""
            return (f"Design for milestone **{ms}**: [`docs/design/{ms}.md`](https://github.com/{self.repo()}/blob/"
                    f"{job['branch']}/docs/design/{ms}.md)\n\n### Architect\n{verdict}\n\n---\nBuilt by the harness loop. "
                    f"The milestone's features build on this branch; it merges once CI is green.\n")
        f = self.main.get(fid, {})
        evidence = (wt / f"harness/evidence/{fid}.md").read_text() if (wt / f"harness/evidence/{fid}.md").exists() else ""
        verdict = "\n".join(line for line in evidence.splitlines() if line.startswith(("VERDICT", "- ")))[:2500]
        shots = sorted((wt / f"harness/evidence/{fid}").glob("*.png"), key=lambda x: ("mobile" not in x.stem, x.name)) \
            if (wt / f"harness/evidence/{fid}").exists() else []  # the owner reads these on a phone
        images = "\n".join(f"![{s.stem}](https://github.com/{self.repo()}/blob/{job['branch']}/harness/evidence/{fid}/{s.name}?raw=true)"
                           for s in shots)
        steps = "\n".join(f"- {a}" for a in f.get("acceptance", []))
        return (f"Feature **{fid}**: {f.get('title', '')}\n\n### Acceptance\n{steps}\n\n### Verifier\n{verdict}\n\n{images}\n\n"
                + (f"### Review\n{findings}\n\n" if findings else "")
                + "---\nBuilt by the harness loop. It merges this PR itself (squash) once CI is green, the verifier "
                  "passed and review found no bugs.\n")

    def open_pr(self, job):
        with GIT_LOCK:
            git("push", "-q", "-f", "-u", "origin", job["branch"], cwd=job["worktree"])
        body = self.home / f"pr-{job['id']}.md"
        body.write_text(self.pr_body(job))
        existing = gh("pr", "list", "--head", job["branch"], "--state", "open", "--json", "number,url", cwd=self.root).stdout
        prs = json.loads(existing or "[]")
        if prs:
            job["pr"], job["pr_url"] = prs[0]["number"], prs[0]["url"]
            gh("pr", "edit", str(job["pr"]), "--base", job["base"], "--body-file", str(body), cwd=self.root)
        else:
            url = gh("pr", "create", "--base", job["base"], "--head", job["branch"],
                     "--title", f"{job['id']}: {job['title']}", "--body-file", str(body), cwd=self.root).stdout.strip()
            job["pr"], job["pr_url"] = int(url.rstrip("/").rsplit("/", 1)[-1]), url

    # stage: review and fixing -----------------------------------------------------------
    def start_review(self, job):
        self.set_stage(job, "review", note=job.get("note"))
        self.launch(job, self.work_review)

    def work_review(self, job):
        # A stacked job is reviewed against the commit it was built on: its base branch may have been
        # rebased since (seen for real: F003's diff against a rebased agent/F001 held all of F001, 42 files).
        base = "origin/main" if job["base"] == "main" else job.get("base_sha") or job["base"]
        ms = self.main.get(job["id"], {}).get("milestone")
        design = f"docs/design/{ms}.md"
        also = (f" The milestone's design is {design}: tell the reviewer to check the diff against it."
                if ms and (Path(job["worktree"]) / design).exists() else "")
        head = git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()
        seen = job.get("reviewed_head")
        # After a fix, only what the fix changed is reviewed, against the bugs it was asked to fix. A
        # conflict resolution (main merged in) or a rebase since gets a full review again.
        delta = (seen and job.get("fix_rounds") and not job.pop("full_review", False)
                 and git("merge-base", "--is-ancestor", seen, "HEAD", cwd=job["worktree"], check=False).returncode == 0)
        span = f"{seen}..HEAD" if delta else f"{base}...HEAD"
        job["reviewed_head"] = head
        changed = git("diff", "--name-only", span, cwd=job["worktree"]).stdout.split()
        baselines = [p for p in changed if p.startswith("e2e/__screenshots__/") and p.endswith(".png")]
        pictures = [p for p in changed if p.endswith(".png")]
        docs_only = changed and all(DOCS.search(p) for p in changed)
        if not docs_only and any(SENSITIVE.search(p) and not NOT_SENSITIVE.search(p) for p in changed):
            also += " Also spawn the security-reviewer subagent on the same diff."
        if not docs_only and (pictures if delta else (job.get("shots") or baselines)):  # the designer judges what users see
            also += (f" Also spawn the designer subagent on feature {job['id']} with base {base}"
                     + (f" and these changed baselines: {', '.join(baselines)}" if baselines else "")
                     + (f" (a stacked PR: UI that {job['base']} already has is the base PR's, not this feature's)"
                        if base != "origin/main" else "")
                     + ".")
        also += (" Run every subagent named here in the foreground (not in the background) and wait for all of them."
                 if also else "")
        fixed = (f" This is a re-review after a fix: the diff is only the fix. Ask the reviewer to check that it fixes "
                 f"these findings and adds no new bug:\n{job.get('last_bugs', '')}\n" if delta else "")
        prompt = (f"Spawn the reviewer subagent on `git diff {span}`.{fixed}{also} Do not edit or commit anything. "
                  "Reply with only their finding lines, most severe first, or exactly: No findings.")
        cost, subtype, text = self.claude(job, prompt, self.opts.model, turns=60, lane_note=False)
        return {"cost": cost, "subtype": subtype, "findings": text.strip()}

    def finish_review(self, job, res):
        if self.base_merged(job):  # the base PR merged while this review ran: move onto main
            self.restack(job)
            if job["base"] != "main":
                return  # the rebase failed and the feature builds again
            # A clean rebase leaves the PR's own changes as they were, so the review still holds.
        text = res.get("findings", "")
        reported = "No findings" in text or REVIEW_LINE.search(text)
        if res.get("subtype") != "success" or not reported:
            # Cut off (budget, turns), crashed, or ended its turn before its subagents reported (seen for real:
            # "All three subagents are running ... I'm waiting" was read as no bugs): it reviewed nothing.
            if res.get("subtype") == "success":
                res["subtype"] = "no findings reported"
            job["review_failures"] = job.get("review_failures", 0) + 1
            if job["review_failures"] >= 2:
                return self.set_stage(job, "held", note=f"review did not finish ({res.get('subtype')})",
                                      question=f"{job['id']}: the review session did not finish twice "
                                               f"({res.get('subtype')}); the PR stays open. Review it, or answer and the loop fixes the "
                                               "branch with your answer and reviews it again.")
            return self.set_stage(job, "review", note=f"review did not finish ({res.get('subtype')}); again")
        findings = res.get("findings", "")
        job["findings"] = findings
        bugs = [line for line in findings.splitlines() if "[bug]" in line]
        kinds = {}  # one occurrence per kind per review, however many lines it has
        for line in bugs:
            kind = ("security" if "security:" in line else "design doc" if "docs/design" in line
                    else "ui (designer)" if ".png" in line.split("[bug]")[0] else "code")
            kinds.setdefault(kind, []).append(line.strip())
        for kind, lines in kinds.items():
            self.failure(job, f"review bug: {kind}", detail="\n".join(lines))
        job["last_bugs"] = "\n".join(bugs)
        if not bugs:
            with GIT_LOCK:  # CI and the merge must see what was reviewed (a restart can leave a fix unpushed)
                git("push", "-q", "-f", "origin", job["branch"], cwd=job["worktree"])
            return self.set_stage(job, "ci", note="review: no bugs")
        if job["fix_rounds"] >= 2:
            return self.set_stage(job, "held", note="review still finds bugs after 2 fixes",
                                  question=f"{job['id']}: review still finds bugs after 2 fix rounds:\n" + "\n".join(bugs))
        if not self.can_start():  # the fix starts from these findings once it can: the review is not paid for twice
            job["fix_waiting"] = "The reviewer found these bugs:\n" + "\n".join(bugs)
            return self.set_stage(job, "review", note="the fix waits for " + ("a less busy machine" if self.busy
                                                                               else "budget"))
        return self.start_fix(job, "The reviewer found these bugs:\n" + "\n".join(bugs))

    def start_fix(self, job, problems, count=True):
        job["fix_rounds"] += 1 if count else 0
        job["fix_from_human"] = job.pop("answered", False)
        job["fix_with"] = problems
        job["fix_base"] = git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()
        self.set_stage(job, "fixing", note=f"round {job['fix_rounds']}")
        self.launch(job, self.work_fix)

    def work_fix(self, job):
        if job.get("kind") == "rule":
            prompt = (f"You are continuing a rule PR for the repeated failure \"{job['rule_for']}\" on this branch. Fix only "
                      f"these problems:\n{job['fix_with']}\n\nChange only docs/golden-principles.md and "
                      ".claude/agents/reviewer.md, run ./scripts/check.sh, and commit.")
            cost, subtype, _ = self.claude(job, prompt, self.opts.large_model)
            return {"cost": cost, "subtype": subtype}
        if job.get("kind") == "design":
            prompt = (f"You are continuing the design of milestone {job['milestone']} on this branch. Fix only these "
                      f"problems:\n{job['fix_with']}\n\nThen run ./scripts/check.sh. If you change docs/design/"
                      f"{job['milestone']}.md, spawn the architect subagent on {job['milestone']} again and wait for "
                      "its PASS. Commit everything.")
            cost, subtype, _ = self.claude(job, prompt, self.opts.large_model)
            return {"cost": cost, "subtype": subtype}
        prompt = (f"You are continuing feature {job['id']} ({job['title']}) on this branch. Fix only these problems:\n"
                  f"{job['fix_with']}\n\nThen run ./scripts/check.sh, spawn the verifier subagent for {job['id']} again, "
                  f"keep harness/status/{job['id']}.json passing only if the verifier passes (set it blocked with "
                  f"blocked_reason failed otherwise), add a short entry at the top of harness/log/{job['id']}.md, "
                  "and commit everything.")
        cost, subtype, _ = self.claude(job, prompt, self.fix_model(job))
        return {"cost": cost, "subtype": subtype}

    def fix_model(self, job):
        """The large model fixes, except (LOOP_FIX_SONNET=1) a first fix of an S/M feature's review or CI bugs:
        conflicts, the human's answers and second rounds stay on it. Turned off by itself if under 70% of the
        first 20 such fixes merged without another round."""
        stats = self.state.setdefault("fix_stats", {"tries": 0, "ok": 0})
        if (FIX_SONNET and not stats.get("off") and job["fix_rounds"] == 1 and not job.get("fix_guard_base")
                and not job.get("fix_from_human")
                and self.main.get(job["id"], {}).get("complexity", "M") in ("S", "M")):
            job["fixed_by_default_model"] = True
            return self.opts.model
        return self.opts.large_model

    def record_fix(self, job):
        """At merge: did the default model's first fix need another round?"""
        if not job.pop("fixed_by_default_model", False):
            return
        stats = self.state.setdefault("fix_stats", {"tries": 0, "ok": 0})
        stats["tries"] += 1
        stats["ok"] += 1 if job.get("fix_rounds") == 1 else 0
        if stats["tries"] >= 20 and stats["ok"] / stats["tries"] < 0.7 and not stats.get("off"):
            stats["off"] = True
            self.event("loop", f"first fixes on {self.opts.model}: {stats['ok']}/{stats['tries']} held; back to "
                               f"{self.opts.large_model} for all fixes")

    def finish_fix(self, job, res):
        wt = job["worktree"]
        if git("status", "--porcelain", cwd=wt).stdout.strip():
            git("stash", "push", "-q", "-u", "-m", f"loop: uncommitted fix for {job['id']}", cwd=wt)
        guard = run(["git", "show", f"{job['fix_base']}:harness/integrity.py"], cwd=wt).stdout
        # A merge of main is judged against main: the branch's own changes, not main's, must keep the rules.
        guard_base = job.get("fix_guard_base") or job["fix_base"]
        check = self.guard(job, guard, guard_base)
        f = next((x for x in backlog.read(wt) if x["id"] == job["id"]), {"status": "passing"} if job.get("kind") else {})
        cut = res.get("subtype") != "success"  # cut off (budget, turns) or crashed: the fix is not done
        merged = git("merge-base", "--is-ancestor", guard_base, "HEAD", cwd=wt, check=False).returncode == 0
        if job.get("fix_guard_base") and not merged and not cut:
            check.returncode, check.stdout = 1, "main was not merged into the branch"
        if cut and self.starved(job, res):  # undo it and try again with a full budget: the round is given back
            git("reset", "-q", "--hard", job["fix_base"], cwd=wt)
            git("clean", "-q", "-fd", cwd=wt)
            if job.pop("fix_guard_base", None):
                job["conflict_rounds"] = 0
            else:
                job["fix_rounds"] -= 1
            return self.set_stage(job, "review", note=f"fix cut off by the run's budget (${job['last_cap']}); "
                                                      "reviewed and fixed again with a full budget")
        if cut or check.returncode != 0 or f.get("status") != "passing":
            git("reset", "-q", "--hard", job["fix_base"], cwd=wt)
            if job.pop("fix_guard_base", None):  # the conflict could not be resolved: build it again from main
                gh("pr", "close", str(job["pr"]), "--comment", "Could not resolve the conflict with main; the loop "
                   "builds this feature again.", cwd=self.root, check=False)
                return self.retry(job, "conflict with main could not be resolved")
            why = (f"the fix session did not finish ({res.get('subtype')})" if cut else check.stdout.strip()
                   or f.get("notes") or "the fix did not keep the feature passing")
            return self.set_stage(job, "held", note="fix failed",
                                  question=f"{job['id']}: the automatic fix failed ({why[:300]}). What should change?")
        if job.get("fix_guard_base"):  # main is merged in: the branch now sits on main
            job["base"], job["base_sha"] = "main", job.pop("fix_guard_base")
            job["full_review"] = True  # main's changes came in with the merge: review all of it again
        if not self.ensure_base(job):
            return
        with GIT_LOCK:
            git("push", "-q", "-f", "origin", job["branch"], cwd=wt)
        if job.get("pr"):
            gh("pr", "edit", str(job["pr"]), "--base", job["base"], cwd=self.root)
        else:  # a conflict resolved right after the build, before its PR was opened
            self.open_pr(job)
        if job.get("kind"):  # designs and rules had their review in the session
            return self.set_stage(job, "ci", note="fixed")
        self.start_review(job)

    # stage: ci, waiting on base, merging ------------------------------------------------
    def pr_checks(self, job):
        r = gh("pr", "checks", str(job["pr"]), "--json", "bucket,name,link", cwd=self.root, check=False)
        if "no checks reported" in (r.stderr + r.stdout):
            return "none"
        try:
            checks = json.loads(r.stdout or "[]")
        except ValueError:
            return "pending"
        buckets = [c["bucket"] for c in checks]
        job["ci_runs"] = sorted({m.group(1) for c in checks if c["bucket"] in ("fail", "cancel")
                                 for m in [re.search(r"/actions/runs/(\d+)", c.get("link") or "")] if m})
        if not buckets:
            return "none"
        if any(b in ("fail", "cancel") for b in buckets):
            return "fail"
        return "pass" if all(b in ("pass", "skipping") for b in buckets) else "pending"

    def not_started(self, run_ids):
        """True when a failed run's jobs never started (no runner, no steps): GitHub refused to run them,
        for example for billing. A real run saw it as a failure and reverted a good feature."""
        for rid in run_ids:
            out = gh("run", "view", str(rid), "--json", "jobs", cwd=self.root, check=False).stdout
            try:
                jobs = json.loads(out or "{}").get("jobs", [])
            except ValueError:
                continue
            if any(j.get("conclusion") == "failure" and not j.get("steps") for j in jobs):
                return True
        return False

    def block_ci(self, url):
        if not self.state["ci_blocked"]:
            self.state["ci_blocked"] = True
            self.push(f"ci_blocked:{self.state['started']}", "CI is not starting",
                      "GitHub Actions starts no jobs (billing or runner). Nothing merges until it does.", priority=4)
            self.event("loop", f"ci blocked: GitHub Actions did not start the jobs ({url or 'no link'}); check the "
                               "account's Billing & plans (spending limit, payment). Nothing merges or reverts until CI runs.")

    def pr_head(self, job):
        return gh("pr", "view", str(job["pr"]), "--json", "headRefOid", "--jq", ".headRefOid", cwd=self.root,
                  check=False).stdout.strip()

    def advance_ci(self, job):
        # The head before its checks: a push in between gets checks of its own (pending), and a merge of
        # this older head is refused, so what merges is always a commit CI passed.
        head = self.pr_head(job)
        result = self.pr_checks(job)
        if result == "none":  # a repo without workflows: give GitHub a moment to register them
            job["no_checks"] = job.get("no_checks", 0) + 1
            if job["no_checks"] < 3:
                return
            result = "pass"
        if result == "pending":
            return
        if result == "fail" and self.not_started(job.get("ci_runs", [])):
            return self.block_ci(job.get("pr_url"))  # not the code: wait for CI to run at all
        if result == "fail":
            head = git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()
            if job.get("ci_rerun_of") != head and job.get("ci_runs"):
                # Once per commit, run the failed jobs again before spending a fix session on them.
                # Seen for real: a rule PR that changed two docs failed a one-run Lighthouse score (0.86 < 0.9).
                job["ci_rerun_of"] = head
                for run_id in job["ci_runs"]:
                    gh("run", "rerun", run_id, "--failed", cwd=self.root, check=False)
                return self.set_stage(job, "ci", note="CI failed; running the failed jobs again in case it was a flake")
            if self.lanes_busy() >= self.opts.lanes:
                return  # no lane free for the fix yet; look again next tick
            if job["fix_rounds"] >= 2:
                return self.set_stage(job, "held", note="CI still fails after 2 fixes",
                                      question=f"{job['id']}: CI keeps failing on {job['pr_url']}. What should change?")
            if not self.can_start():
                job["fix_waits"] = True  # a run with budget picks it up
                return
            job.pop("fix_waits", None)
            self.failure(job, "CI failed on the PR")
            log = "\n".join(gh("run", "view", rid, "--log-failed", cwd=self.root, check=False).stdout
                            for rid in job.get("ci_runs", []))
            excerpt = ci_log.trim(log) if log.strip() else ""
            return self.start_fix(job, f"CI failed on the PR ({job['pr_url']}). Run ./scripts/check.sh, find the failure "
                                       "and fix it." + (f"\n\nThe failed steps' log (last lines):\n```\n{excerpt}\n```"
                                                        if excerpt else ""))
        job["ci_sha"] = head or git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()  # what CI passed
        if job["base"] != "main":
            return self.set_stage(job, "waiting_base", note=f"green; waits for {job['base']} to merge")
        self.set_stage(job, "merging")

    def advance_merge(self, job):
        if self.state["main_red"] and not job.get("revert_of"):
            return  # nothing but the revert merges onto a red main
        wt = job["worktree"]
        with GIT_LOCK:
            git("fetch", "-q", "origin", cwd=wt)
            behind = git("merge-base", "--is-ancestor", "origin/main", "HEAD", cwd=wt, check=False).returncode != 0
        if behind:  # main moved since CI ran: rebase, push, and let CI run again
            if not self.rebase(job, "origin/main"):
                return
            return self.set_stage(job, "ci", note="rebased on the new main")
        lead = round(time.time() - job.get("first_started", time.time()))
        job["lead_seconds"] = lead
        # Only the commit CI passed may merge: a push after CI (by anyone) sends it back to CI.
        verified = job.get("ci_sha") or git("rev-parse", "HEAD", cwd=wt).stdout.strip()
        merge = gh("pr", "merge", str(job["pr"]), "--squash", "--match-head-commit", verified,
                   "--subject", f"{job['id']}: {job['title']} (#{job['pr']})",
                   "--body", f"Harness-Cost: ${job.get('cost', 0):.2f}\nHarness-Sessions: {len(job.get('sessions', []))}\n"
                             f"Harness-Time: {lead // 60} min" + (f"\nHarness-Session-Ids: {', '.join(ids)}" if (ids := [
                                 x["session_id"] for x in job.get("sessions", []) if x.get("session_id")]) else ""),
                   cwd=self.root, check=False)
        if merge.returncode != 0:
            why = (merge.stderr or merge.stdout).strip()[-400:]
            head = self.pr_head(job)
            if head and head != verified:
                return self.set_stage(job, "ci", note=f"the PR changed after CI passed ({head[:7]}); CI again")
            raise RuntimeError(f"gh pr merge failed: {why}")  # a network error retries; anything else is held
        job["merge_sha"] = gh("pr", "view", str(job["pr"]), "--json", "mergeCommit", "--jq", ".mergeCommit.oid",
                              cwd=self.root).stdout.strip()
        job["merged_at"], job["merged_run"] = now(), self.state["started"]
        if not job.get("kind") and not job.get("revert_of"):  # the branch is deleted soon: images point at the commit
            body = self.home / f"pr-{job['id']}.md"
            body.write_text(self.pr_body(job, job.get("findings", "")).replace(f"/blob/{job['branch']}/",
                                                                                f"/blob/{job['merge_sha']}/"))
            gh("pr", "edit", str(job["pr"]), "--body-file", str(body), cwd=self.root, check=False)
        self.set_stage(job, "merged", note=f"#{job['pr']} -> main {job['merge_sha'][:7]}")
        self.record_fix(job)
        try:
            self.maybe_sample(job)
        except Exception as e:  # the merge is done; a sample that failed to post is only logged
            with (self.home / "loop.log").open("a") as f:
                f.write(f"{now()} {job['id']} owner check not posted: {e!r}\n")
        self.state["last_merge"] = job["id"]
        for dep_job in self.state["jobs"].values():  # idle PRs stacked on this one move to main now;
            if (dep_job.get("base") == job["branch"] and dep_job["id"] not in self.threads
                    and dep_job["stage"] in ("review", "ci", "waiting_base", "merging")):
                self.restack(dep_job)        # ones with a session running move when it ends
        with GIT_LOCK:
            self.remove_worktree(job)
        self.delete_merged_branches()

    def base_merged(self, job):
        return job["base"] != "main" and any(j.get("branch") == job["base"] and j["stage"] == "merged"
                                             for j in self.state["jobs"].values())

    def ensure_base(self, job):
        """A job stacked on a PR that has merged since: rebase it onto main. False if that failed."""
        if not self.base_merged(job):
            return True
        with GIT_LOCK:
            git("fetch", "-q", "origin", cwd=job["worktree"])
        cmd = ["rebase", "-q", "--onto", "origin/main", job["base_sha"]]
        if git(*cmd, cwd=job["worktree"], check=False).returncode != 0 and not self.regenerate(job):
            files = git("diff", "--name-only", "--diff-filter=U", cwd=job["worktree"], check=False).stdout.split()
            git("rebase", "--abort", cwd=job["worktree"], check=False)
            if not job.get("conflict_rounds") and self.can_start() and not self.paused():
                # Finished, verified work: a session merges main in instead of building it again (a rule job
                # proposed this after F015 was rebuilt from scratch twice).
                return self.resolve(job, "origin/main", files)
            if job.get("pr"):
                gh("pr", "close", str(job["pr"]), cwd=self.root, check=False)
            self.retry(job, "conflict while moving onto main after its base merged")
            return False
        job["base"] = "main"
        job["base_sha"] = git("rev-parse", "origin/main", cwd=job["worktree"]).stdout.strip()
        return True

    def delete_merged_branches(self):
        """Delete a merged feature's branch once no open work is stacked on it."""
        for job in self.state["jobs"].values():
            if job["stage"] != "merged" or job.get("branch_deleted"):
                continue
            if any(j.get("base") == job["branch"] and j["stage"] not in DONE for j in self.state["jobs"].values()):
                continue
            with GIT_LOCK:
                git("push", "-q", "origin", "--delete", job["branch"], cwd=self.root, check=False)
                git("branch", "-q", "-D", job["branch"], cwd=self.root, check=False)
            job["branch_deleted"] = True

    def rebase(self, job, onto, upstream=None):
        wt = job["worktree"]
        cmd = ["rebase", "-q", "--onto", onto, upstream] if upstream else ["rebase", "-q", onto]
        if git(*cmd, cwd=wt, check=False).returncode != 0 and not self.regenerate(job):
            files = git("diff", "--name-only", "--diff-filter=U", cwd=wt, check=False).stdout.split()
            git("rebase", "--abort", cwd=wt, check=False)
            if (not job.get("revert_of") and not job.get("conflict_rounds") and self.can_start()
                    and not self.paused()):
                return self.resolve(job, onto, files)  # a session merges main in, rather than building it again
            gh("pr", "close", str(job["pr"]), "--comment", "Could not rebase; the loop builds this feature again.",
               cwd=self.root, check=False)
            self.retry(job, f"conflict while rebasing onto {onto}")
            return False
        with GIT_LOCK:
            git("push", "-q", "-f", "origin", job["branch"], cwd=wt)
        return True

    def regenerate(self, job):
        """Go on with a stopped rebase whose only conflicts are generated files: take main's copy, write the
        file again with its command (harness/generated.json maps each file to one) and continue. Every route
        feature of the API preset regenerates openapi.json, so parallel lanes kept conflicting on it and
        paying a session to merge. False, with the rebase still stopped, when anything else conflicts."""
        wt = job["worktree"]
        try:
            gen = json.loads((Path(wt) / "harness/generated.json").read_text())
        except (OSError, ValueError):
            return False
        done = []
        for _ in range(200):  # one round per commit that conflicts
            files = git("diff", "--name-only", "--diff-filter=U", cwd=wt, check=False).stdout.split()
            if files:
                if not all(f in gen for f in files):
                    return False
                for f in files:
                    git("checkout", "--ours", "--", f, cwd=wt)  # in a rebase, "ours" is main's side
                for cmd in dict.fromkeys(gen[f] for f in files):
                    if run(["bash", "-c", cmd], cwd=wt).returncode != 0:
                        return False
                git("add", "--", *files, cwd=wt)
                done += [f for f in files if f not in done]
                step = git("-c", "core.editor=true", "rebase", "--continue", cwd=wt, check=False)
            elif git("diff", "--cached", "--quiet", cwd=wt, check=False).returncode == 0 and done:
                step = git("rebase", "--skip", cwd=wt, check=False)  # nothing left of its own once regenerated
            else:  # stopped for another reason (a hook, say): never drop a commit
                return False
            if step.returncode == 0:
                self.event(job["id"], f"conflict only in generated {', '.join(done)}; regenerated it from the merged code")
                return True
        return False

    def resolve(self, job, onto, files):
        """Hand a conflict with main to a session: it merges main into the branch and resolves it, once per job."""
        job["conflict_rounds"] = 1
        job["fix_guard_base"] = git("rev-parse", onto, cwd=job["worktree"]).stdout.strip()
        self.event(job["id"], f"conflict with main in {', '.join(files[:5]) or 'some files'}; a session resolves it")
        self.start_fix(job, f"Main moved on and this branch now conflicts with it (in: {', '.join(files) or 'unknown files'}). "
                            f"Run `git merge {onto}` (already fetched), resolve every conflict so this feature and "
                            "everything main gained both keep working, keep main's tests as they are, and commit the "
                            "merge.", count=False)
        return False

    def restack(self, job):
        with GIT_LOCK:
            git("fetch", "-q", "origin", cwd=job["worktree"])
        if self.rebase(job, "origin/main", job["base_sha"]):
            gh("pr", "edit", str(job["pr"]), "--base", "main", cwd=self.root)
            job["base"] = "main"
            job["base_sha"] = git("rev-parse", "origin/main", cwd=job["worktree"]).stdout.strip()
            self.set_stage(job, "review" if job["stage"] == "review" else "ci", note="base merged; rebased onto main")

    # main after a merge -----------------------------------------------------------------
    def main_ci(self, sha):
        out = gh("run", "list", "--commit", sha, "--json", "status,conclusion,url,databaseId", cwd=self.root,
                 check=False).stdout
        runs = json.loads(out or "[]")
        if not runs:
            return "none", ""
        failed = [r for r in runs if r["status"] == "completed" and r["conclusion"] not in ("success", "skipped", "neutral")]
        if failed and self.not_started([r["databaseId"] for r in failed if r.get("databaseId")]):
            return "blocked", failed[0].get("url", "")
        # A failed or cancelled run is run again, once, before it counts. A cancelled run or one the runner
        # lost says nothing about the code, and a one-off failure (a latency budget on a busy self-hosted
        # machine) got a docs-only feature reverted in a real run. Failing a second time, it is real.
        reran = self.state.setdefault("reran_runs", [])
        again = [r for r in failed if r.get("databaseId") and str(r["databaseId"]) not in reran]
        for r in again:
            reran.append(str(r["databaseId"]))
            gh("run", "rerun", str(r["databaseId"]), cwd=self.root, check=False)
        if again:
            return "pending", ""
        if failed:
            return "fail", failed[0].get("url", "")
        return ("pass", "") if all(r["status"] == "completed" for r in runs) else ("pending", "")

    def watch_main(self):
        for job in list(self.state["jobs"].values()):  # revert() adds jobs
            if job["stage"] != "merged" or job.get("main_checked"):
                continue
            result, url = self.main_ci(job["merge_sha"])
            if result == "none":
                self.main_ci_since.setdefault(job["id"], time.time())
                if time.time() - self.main_ci_since[job["id"]] > MAIN_GRACE:
                    job["main_checked"] = True
                continue
            if result == "pending":
                continue
            if result == "blocked":
                self.block_ci(url)
                continue
            head = self.state.get("main_sha")
            if (result == "fail" and head and head != job["merge_sha"] and not job.get("revert_of")
                    and git("merge-base", "--is-ancestor", job["merge_sha"], head, cwd=self.root,
                            check=False).returncode == 0):
                # Main has moved on since: its newest CI, which runs this feature too, decides. A real run
                # reverted two features over a flaky e2e check that passed on the very next main commit.
                later, _ = self.main_ci(head)
                if later in ("pending", "none", "blocked"):
                    continue
                if later == "pass":
                    job["main_checked"] = True
                    self.event(job["id"], f"main CI failed on its merge ({url}) but passed on {head[:7]}, which "
                                          "includes it: a flaky check, not reverting")
                    continue
            job["main_checked"] = True
            if result == "fail" and job.get("revert_of"):  # never revert a revert: a human decides
                self.set_stage(job, "held", note=f"main CI still fails after the revert: {url}",
                               question=f"Main's CI still fails after reverting {job['revert_of']} ({url}). "
                                        "Something else broke main; nothing merges until it is green.")
            elif result == "fail":
                self.revert(job, url)
        if self.state["main_red"]:
            revert = self.job(self.state["main_red_by"])
            if revert and revert["stage"] == "merged" and revert.get("main_checked"):  # its own main CI passed
                self.state["main_red"] = False
                self.event(revert["id"], "main is green again")

    def revert(self, job, url):
        self.failure(job, "main CI failed after merge")
        fid, rid = job["id"], f"R-{job['id']}"
        self.state["main_red"], self.state["main_red_by"] = True, rid
        rev = {"id": rid, "title": f"Revert {fid}", "branch": f"agent/revert-{fid}", "base": "main",
               "worktree": str(self.trees / rid), "attempts": 0, "fix_rounds": 2, "cost": 0.0, "answers": [],
               "revert_of": fid}
        self.state["jobs"][rid] = rev
        with GIT_LOCK:
            git("fetch", "-q", "origin", cwd=self.root)
            self.remove_worktree(rev)
            git("worktree", "add", "-q", "-B", rev["branch"], rev["worktree"], "origin/main", cwd=self.root)
            git("revert", "--no-edit", job["merge_sha"], cwd=rev["worktree"])
            git("push", "-q", "-f", "-u", "origin", rev["branch"], cwd=rev["worktree"])
        url_pr = gh("pr", "create", "--base", "main", "--head", rev["branch"], "--title", f"Revert {fid}: main CI failed",
                    "--body", f"Main CI failed after #{job['pr']} merged: {url}\n\nOpened by the harness loop.",
                    cwd=self.root).stdout.strip()
        rev["pr"], rev["pr_url"] = int(url_pr.rstrip("/").rsplit("/", 1)[-1]), url_pr
        self.set_stage(rev, "ci", note=f"reverting {fid}")
        self.set_stage(job, "reverted", note=f"main CI failed after merge: {url}",
                       question=f"{fid} was merged but main's CI then failed ({url}); the loop reverted it. "
                                "Tell it what to watch out for, and it builds the feature again.")

    # housekeeping ------------------------------------------------------------------------
    def remove_worktree(self, job):
        wt = job.get("worktree")
        if wt and Path(wt).exists():
            git("worktree", "remove", "--force", wt, cwd=self.root, check=False)
        git("worktree", "prune", cwd=self.root, check=False)

    def apply_answers(self):
        for path in sorted(self.home.glob("answer-*.json")):
            a = json.loads(path.read_text())
            path.unlink()
            job = self.job(a["id"])
            if job and a.get("drop"):
                job["question"] = None
                self.set_stage(job, "dropped", note=a["text"])
                continue
            if job and job.get("revert_of") and job["stage"] == "held":
                # The human fixed what blocked the revert: put it on the current main and let CI run again.
                job.setdefault("answers", []).append(a["text"])
                job["question"] = None
                with GIT_LOCK:
                    git("fetch", "-q", "origin", cwd=job["worktree"])
                if self.rebase(job, "origin/main"):
                    self.set_stage(job, "ci", note="answered; revert rebased on main, CI again")
            elif job and job["stage"] == "held" and job.get("budget_held"):
                more = re.search(r"\$?\s*(\d+(?:\.\d+)?)\s*(?:\$|dollars?|usd)?\s*more", a["text"], re.I)
                job["budget_extra"] = job.get("budget_extra", 0) + (float(more.group(1)) if more else 5.0)
                stage, job["question"] = job.pop("budget_held"), None
                if stage == "fixing":
                    self.set_stage(job, "fixing", note=f"budget +${job['budget_extra']:.2f}; fixing")
                    self.launch(job, self.work_fix)
                else:
                    self.set_stage(job, "queued" if stage == "building" else stage,
                                   note=f"budget +${job['budget_extra']:.2f}; going on")
            elif job and job["stage"] == "held" and job.get("pr"):
                # Its PR is open with committed work: fix the branch with the answer, never rebuild it.
                if self.lanes_busy() >= self.opts.lanes or not self.can_start() or self.paused():
                    path.write_text(json.dumps(a))  # no lane or budget yet: apply it on a later tick
                    continue
                job.setdefault("answers", []).append(a["text"])
                job["fix_rounds"] = job["review_failures"] = 0  # the answer earns the usual two rounds
                job["answered"] = True
                self.start_fix(job, f"{job.get('question') or 'The PR was held.'}\n\nThe human answered: {a['text']}")
            elif job and job["stage"] in WAITING_HUMAN:
                job.setdefault("answers", []).append(a["text"])
                job["attempts"], job["question"] = 0, None
                self.set_stage(job, "queued", note="answered; building again")

    def collect(self):
        for fid, (t, holder, stage) in list(self.threads.items()):
            if t.is_alive():
                continue
            del self.threads[fid]
            job, res = self.job(fid), holder.get("result", {})
            self.count(job, holder, stage)
            if res.get("subtype") in ("limit", "infra"):
                self.pause(job, stage, infra=res["subtype"] == "infra")
                continue
            self.state.pop("infra_since", None)  # a session got through: the API is back
            self.state["infra_pauses"] = 0
            try:
                {"building": self.finish_build, "review": self.finish_review, "fixing": self.finish_fix}[stage](job, res)
            except Exception as e:
                if TRANSIENT.search(str(e)):  # keep the session's work and finish it on a later tick
                    self.threads[fid] = (t, holder, stage)
                    if not holder.get("offline"):
                        holder["offline"] = True
                        self.event(fid, f"network error, will retry: {str(e)[:160]}")
                    continue
                self.set_stage(job, "held", note=f"loop error: {e}", question=f"{fid}: the loop hit an error: {e}")

    def infra_wait(self):
        n = self.state.get("infra_pauses", 0)
        self.state["infra_pauses"] = n + 1
        return time.time() + INFRA_PAUSE * (1, 2, 4, 6)[min(n, 3)]

    def pause(self, job, stage, infra=False):
        """Claude's usage limit, or its API unreachable, stopped this session: keep the job as it was and pause
        Claude work until the reset (or the API answers again). Neither is the job's fault: no attempt is used."""
        if infra:
            message = job.pop("infra_message", "Claude's API unreachable")
            self.state.setdefault("infra_since", time.time())
            until, why = self.infra_wait(), "Claude's API unreachable"
            down = time.time() - self.state["infra_since"]
            if down > OFFLINE_MAX:
                self.state["stop_now"] = True
                self.state["stop_reason"] = f"Claude's API unreachable for {down / 60:.0f} min ({message[:120]})"
        else:
            message = job.pop("limit_message", "usage limit")
            until, why = limit_resume(message), "Claude usage limit"
        if until > self.state.get("paused_until", 0):
            self.state["paused_until"], self.state["pause_kind"] = until, "infra" if infra else "limit"
            resumes = datetime.datetime.fromtimestamp(until).strftime('%H:%M')
            self.event("loop", f"paused: {why} ({message[:120]}); resumes {resumes}")
            self.push(f"pause:{self.state['pause_kind']}:{int(until) // 600}", "Loop paused", f"{why}; resumes {resumes}.")
        if stage == "building":
            self.set_stage(job, "queued", note="waits for the usage limit to reset")  # not an attempt
        elif stage == "fixing":  # undo the half-done fix; the review runs again and asks for the fix again
            git("reset", "-q", "--hard", job["fix_base"], cwd=job["worktree"])
            git("clean", "-q", "-fd", cwd=job["worktree"])
            job["fix_rounds"] -= 1 if not job.get("fix_guard_base") else 0
            if job.pop("fix_guard_base", None):
                job["conflict_rounds"] = 0  # the conflict is still there; it is handed over again after the reset
            self.set_stage(job, "review", note="waits for the usage limit to reset")
        else:
            self.set_stage(job, "review", note="waits for the usage limit to reset")

    def paused(self):
        if time.time() < self.state.get("paused_until", 0):
            return True
        if self.state.get("paused_until") and self.state.get("pause_kind") == "infra" and not api_reachable():
            self.state["paused_until"] = self.infra_wait()  # still down: wait longer before trying a session
            return True
        if self.state.pop("paused_until", None):
            kind = self.state.pop("pause_kind", "limit")
            self.event("loop", "resumed: " + ("Claude's API answers again" if kind == "infra" else "the usage limit has reset"))
        return False

    def count(self, job, holder, stage):
        """Add a finished session's cost to its job, the run and its milestone, once."""
        if holder.get("counted"):  # a finish retried after a network error was counted already
            return
        holder["counted"] = True
        self.caps.pop(job["id"], None)
        cost = float(holder.get("result", {}).get("cost", 0))
        job["cost"] = round(job.get("cost", 0) + cost, 4)
        self.state["spent"] = round(self.state["spent"] + cost, 4)
        job.setdefault("sessions", []).append({"stage": stage, "model": job.get("last_model"),
                                               "cost": round(cost, 4), "seconds": holder.get("seconds", 0),
                                               "ended": now(), **job.pop("last_telemetry", {})})
        job["seconds"] = job.get("seconds", 0) + holder.get("seconds", 0)
        ms = self.milestone_of(job)
        if ms:
            spent = self.state["milestone_spent"]
            spent[ms] = round(spent.get(ms, 0) + cost, 4)

    def tick(self):
        was, self.busy = self.busy, self.machine_busy()
        if self.busy and not was:
            self.event("loop", f"waiting: {self.busy}; no new session until it eases (CI and merges go on)")
        elif was and not self.busy:
            self.event("loop", "the machine can take sessions again")
        self.poll_comments()
        self.apply_answers()
        self.collect()
        self.refresh_main()
        self.check_milestones()
        for job in list(self.state["jobs"].values()):
            try:
                if job["stage"] == "ci":
                    self.advance_ci(job)
                elif job["stage"] == "merging":
                    self.advance_merge(job)
            except Exception as e:
                if TRANSIENT.search(str(e)):
                    raise  # the network, not the job: the whole tick is retried
                self.set_stage(job, "held", note=f"loop error: {e}", question=f"{job['id']}: the loop hit an error: {e}")
        self.watch_main()
        self.watch_runner()
        self.delete_merged_branches()
        for ms, cap in self.budgets().items():
            if self.over_budget(ms) and not self.state["milestone_over"].get(ms):
                self.state["milestone_over"][ms] = True
                self.event(ms, f"budget: {ms} used ${self.state['milestone_spent'].get(ms, 0):.2f} of ${cap}; "
                               f"its features wait for a new budget (loop.py budget {ms} <dollars>)")
                self.push(f"msbudget:{ms}:{cap}", f"{ms} budget used", f"{ms} spent ${self.state['milestone_spent'].get(ms, 0):.2f} "
                                                                      f"of ${cap}; its features wait for more.")
            elif not self.over_budget(ms):
                self.state["milestone_over"].pop(ms, None)
        if (self.home / "stop").exists():
            (self.home / "stop").unlink()
            self.stopping, self.state["stop_reason"] = True, "stopped by you"
        # Lane work: reviews first (they unblock merges), then new builds. Neither starts once the
        # budget is used or held by running sessions: a session capped at nothing ends without a result.
        # Waiting reviews resume next run.
        paused = self.paused()  # Claude's usage limit: CI and merges go on, Claude work waits for the reset
        for job in self.state["jobs"].values():
            if self.lanes_busy() >= self.opts.lanes or not self.can_start() or paused:
                break
            if job["stage"] == "review" and job["id"] not in self.threads:
                if job.get("fix_waiting"):
                    self.start_fix(job, job.pop("fix_waiting"))
                else:
                    self.start_review(job)
        if self.low_budget() and not self.state["stop_reason"]:
            self.state["stop_reason"] = (f"budget ${self.state['budget']} used" if self.state["budget"] - self.state["spent"] < 0.01
                                         else f"budget ${self.state['budget']} used (less than ${MIN_SESSION:.2f} left, too little "
                                              "to start a session)")
            self.push(f"budget:{self.state['started']}", "Budget used",
                      f"Spent ${self.state['spent']:.2f} of ${self.state['budget']}; work in flight finishes, nothing new starts.")
        if not self.stopping and not paused and not self.state["ci_blocked"] and not self.state.get("ci_stalled"):
            # nothing new while CI cannot run
            for f, base in self.ready():
                if self.lanes_busy() >= self.opts.lanes or not self.can_start():
                    break
                self.start_build(f, base)
        self.state["health"] = health.snapshot(self.state, self.root)
        self.state["last_tick"] = now()
        self.save()

    def base_waits_on_human(self, job, seen=()):
        """True when the job's base PR cannot move without a human: it is held, it is back in the queue and
        this run has no budget left (or is stopping) to build it, it waits for a review or fix session the
        spent budget cannot start, or it waits in turn on a base like that."""
        stuck = WAITING_HUMAN | ({"queued"} if self.stopping or self.low_budget() else set())
        broke = self.low_budget()
        for j in self.state["jobs"].values():
            if j.get("branch") != job["base"] or j["id"] in seen:
                continue
            if (j["stage"] in stuck
                    or broke and j["stage"] == "review" and j["id"] not in self.threads
                    or broke and j["stage"] == "ci" and j.get("fix_waits")
                    or j["stage"] == "waiting_base" and self.base_waits_on_human(j, (*seen, job["id"]))):
                return True
        return False

    def finished(self):
        if self.state.get("stop_now"):  # given up waiting for the network or the API
            return True
        revert = self.job(self.state.get("main_red_by") or "")
        parked = self.state["main_red"] and revert and revert["stage"] in WAITING_HUMAN
        broke = self.low_budget()
        active = [j for j in self.state["jobs"].values() if j["stage"] not in DONE | WAITING_HUMAN | {"queued"}
                  and not (parked and j["stage"] == "merging")  # cannot merge until a human fixes main
                  and not (broke and j["stage"] == "review" and j["id"] not in self.threads)  # next run reviews it
                  and not (broke and j["stage"] == "ci" and j.get("fix_waits"))  # next run fixes it
                  and not (j["stage"] == "waiting_base" and self.base_waits_on_human(j))  # moves once a human answers
                  or (j["stage"] == "merged" and not j.get("main_checked"))]
        if parked and not active and not self.threads and not self.state["stop_reason"]:
            self.state["stop_reason"] = f"main CI is red and the revert of {revert.get('revert_of')} needs you"
        if self.state["ci_blocked"] and not self.threads and all(
                j["stage"] in ("ci", "merged") for j in active):
            self.state["stop_reason"] = ("GitHub Actions is not starting jobs (check Billing & plans: spending limit or "
                                         "payment); start the loop again once CI runs")
            return True
        if self.state.get("ci_stalled") and not self.threads and all(
                j["stage"] in ("ci", "merging", "merged") for j in active):
            self.state["stop_reason"] = f"the CI runner is stuck ({self.state['ci_stalled']}); start the loop again once it runs"
            return True
        if active or self.threads:
            return False
        if self.stopping or broke:
            return True
        if self.ready() or (self.state.get("paused_until") and any(j["stage"] == "review" for j in self.state["jobs"].values())):
            return False  # work waits for the usage limit to reset
        if not self.state["stop_reason"]:
            waiting = [j["id"] for j in self.state["jobs"].values() if j["stage"] in WAITING_HUMAN]
            waiting += [f"{ms} budget" for ms in self.state["milestone_over"]]
            self.state["stop_reason"] = ("no ready features left" + (f"; waiting on you: {', '.join(waiting)}" if waiting else ""))
        return True

    def provenance(self):
        """What this run runs on: the kit, Claude Code and the models. A change explains a change in results."""
        manifest = self.root / "harness/kit-manifest.json"
        try:
            kit = json.loads(manifest.read_text()).get("version") if manifest.exists() else None
        except ValueError:
            kit = None
        try:
            claude = run([CLAUDE, "--version"], timeout=30).stdout.split()[:1]
        except (RuntimeError, OSError):
            claude = []
        self.state["provenance"] = {"kit": kit, "claude": claude[0] if claude else None,
                                    "model": self.opts.model, "large_model": self.opts.large_model}
        history = self.home / "history.jsonl"
        last = history.read_text().splitlines()[-1:] if history.exists() else []
        before = (json.loads(last[0]).get("provenance") or {}).get("claude") if last else None
        if before and claude and before != claude[0]:
            self.event("loop", f"Claude Code changed {before} -> {claude[0]} since the last run")

    def stay_awake(self):
        """caffeinate keeps the Mac from sleeping while this process lives (on AC power; -w ends it with us)."""
        if shutil.which("caffeinate"):
            subprocess.Popen(["caffeinate", "-i", "-s", "-w", str(os.getpid())], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL)
            if shutil.which("pmset") and "Battery Power" in run(["pmset", "-g", "batt"], timeout=10).stdout:
                self.event("loop", "warning: on battery power, the Mac may still sleep; plug it in for long runs")

    def run(self):
        signal.signal(signal.SIGTERM, self.terminate)
        if getattr(self.opts, "resuming", False):
            self.event("loop", f"resumed the run of {self.state['started']} (resume {self.state['resumes']} of "
                               f"{MAX_RESUMES}): spent ${self.state['spent']:.2f} of ${self.state['budget']}")
        self.event("loop", f"started: {self.opts.lanes} lanes, budget ${self.opts.budget}"
                   + (f", {self.opts.milestone}" if self.opts.milestone else ""))
        self.provenance()
        self.stay_awake()
        wall, mono = time.time(), time.monotonic()
        errors, offline, announced, waits = 0, None, False, 0
        try:
            while True:
                # The monotonic clock stops while the Mac sleeps; the wall clock does not.
                slept = (time.time() - wall) - (time.monotonic() - mono)
                wall, mono = time.time(), time.monotonic()
                if slept > 120:
                    self.state["sleeps"] = self.state.get("sleeps", 0) + 1
                    self.event("loop", f"slept: the Mac was asleep for about {slept / 60:.0f} min")
                if offline and not online():  # probe first: a tick against a dead network waits out every command
                    if not announced:
                        announced = True
                        self.state["offline_since"] = now()
                        self.event("loop", f"offline: GitHub unreachable; waiting (gives up after {OFFLINE_MAX / 3600:.0f} h)")
                    if time.time() - offline > 600:
                        self.push(f"offline:{int(offline)}", "Loop offline", f"GitHub unreachable since {self.state['offline_since']}; "
                                                                             "the loop waits and goes on by itself.")
                    if time.time() - offline > OFFLINE_MAX:
                        self.state["stop_reason"] = f"offline for {(time.time() - offline) / 3600:.1f} h"
                        break
                    waits += 1
                    time.sleep(min(POLL * 2 ** min(waits, 4), 300))
                    continue
                try:
                    self.tick()
                    errors = 0
                    if offline and announced:
                        self.event("loop", f"online again after {(time.time() - offline) / 60:.0f} min")
                    offline, announced, waits = None, False, 0
                    self.state.pop("offline_since", None)
                except Exception as e:  # GitHub or the network can fail for a while: keep going
                    with (self.home / "loop.log").open("a") as f:
                        f.write(f"{now()} tick failed: {e!r}\n")
                    if TRANSIENT.search(str(e)):  # the network: not counted, it may take hours
                        offline = offline or time.time()
                        waits += 1
                        time.sleep(min(POLL * 2 ** min(waits, 4), 300))
                        continue
                    errors += 1
                    self.event("loop", f"error ({errors} in a row), retrying: {str(e)[:160]}")
                    if errors >= MAX_ERRORS:
                        self.state["stop_reason"] = f"{errors} errors in a row, last: {str(e)[:200]}"
                        break
                if not errors and self.finished():
                    break
                time.sleep(POLL if not errors else min(POLL * errors, 120))
            try:
                self.refresh_main()  # the project folder shows the last merges too
                self.check_milestones(wait=True)  # a last merge may have finished one
            except Exception:
                pass
        except BaseException:
            self.state["crashed"] = True  # `start --resume` (and the launchd service) picks this run up again
            raise
        finally:
            for p in list(self.procs):  # never leave sessions running without a loop
                kill_group(p, grace=2)
            self.state["running"] = False
            self.state["stop_reason"] = self.state.get("stop_reason") or "the loop ended unexpectedly"
            self.save()
            self.write_history()
            self.event("loop", f"stopped: {self.state['stop_reason']} · spent ${self.state['spent']:.2f}")
            self.push(f"end:{self.state['started']}", f"Loop stopped: {self.state['stop_reason']}"[:120],
                      "\n".join(digest_for(self.home, self.state)), wait=True)

    def write_history(self):
        """One line per run in history.jsonl, for the dashboard's History."""
        mine = [j for j in self.state["jobs"].values() if j.get("updated", "") >= self.state["started"]]
        merged = [j for j in mine if j["stage"] == "merged" and j.get("merged_run") == self.state["started"]]
        run = {"started": self.state["started"], "ended": now(), "spent": self.state["spent"],
               "budget": self.state["budget"], "stop_reason": self.state["stop_reason"],
               "merged": [{"id": j["id"], "cost": round(j.get("cost", 0), 2), "minutes": j.get("lead_seconds", 0) // 60,
                           "sessions": len(j.get("sessions", []))} for j in merged],
               "waiting": [j["id"] for j in mine if j["stage"] in WAITING_HUMAN],
               "repeated": self.state["repeated"], "provenance": self.state.get("provenance"),
               "sleeps": self.state.get("sleeps", 0)}
        if self.state.get("cut_off"):  # stop --now: these sessions' costs never arrived
            run.update(spent_incomplete=True,
                       spent_max=round(self.state["spent"] + sum(c["max_cost"] for c in self.state["cut_off"]), 2))
        with (self.home / "history.jsonl").open("a") as f:
            f.write(json.dumps(run) + "\n")

    def terminate(self, *_):
        # A session that finished is counted; one cut off never reports its cost, so the run's spend is
        # incomplete: record the most each could have spent (its cap). Sorted before the kill, which
        # would let a cut session return an empty result.
        cut = []
        for fid, (_, holder, stage) in list(self.threads.items()):
            if "result" in holder:
                self.count(self.job(fid), holder, stage)
            else:
                cut.append({"id": fid, "stage": stage, "max_cost": self.caps.get(fid, 0)})
        for p in list(self.procs):
            kill_group(p, grace=2)
        self.state["cut_off"] = cut
        self.state["running"], self.state["stop_reason"] = False, "stopped at once"
        self.save()
        self.write_history()  # the History tab shows this run too
        os._exit(0)


# --- dashboard ------------------------------------------------------------------------

class QuietServer(http.server.ThreadingHTTPServer):
    def server_bind(self):  # skip the reverse DNS lookup HTTPServer does here
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = "localhost", self.server_address[1]


def serve_dashboard(home, root):
    page = Path(__file__).resolve().parent / "dashboard.html"

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/":
                body, kind = page.read_bytes(), "text/html; charset=utf-8"
            elif path == "/state.json":
                f = home / "state.json"
                body, kind = (f.read_bytes() if f.exists() else b"{}"), "application/json"
            elif path == "/history.json":
                f = home / "history.jsonl"
                rows = [json.loads(line) for line in f.read_text().splitlines()[-50:]] if f.exists() else []
                body, kind = json.dumps(rows).encode(), "application/json"
            elif path == "/metrics.json":
                body, kind = json.dumps(metrics.card([home])).encode(), "application/json"
            elif path == "/health.json":
                f = home / "state.json"
                s = json.loads(f.read_text()) if f.exists() else {}
                body = json.dumps({**(s.get("health") or {}), "last_tick": s.get("last_tick"),
                                   "running": bool(s.get("running") and alive(s.get("pid")))}).encode()
                kind = "application/json"
            elif path == "/events":
                f = home / "events.log"
                body, kind = ("\n".join(f.read_text().splitlines()[-60:]).encode() if f.exists() else b""), "text/plain"
            elif re.fullmatch(r"/evidence/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.png", path):
                fid, name = path.split("/")[2:4]
                state = json.loads((home / "state.json").read_text())
                wt = Path(state["jobs"].get(fid, {}).get("worktree", root))
                f = next((p for p in (wt / f"harness/evidence/{fid}/{name}", Path(root) / f"harness/evidence/{fid}/{name}")
                          if p.exists()), None)
                if not f:
                    self.send_error(404)
                    return
                body, kind = f.read_bytes(), "image/png"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    port = free_port(8700)
    server = QuietServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://localhost:{port}/"


# --- commands ---------------------------------------------------------------------------

def home_of(root):
    return Path(git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=root).stdout.strip()) / "harness-loop"


def alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, ValueError, TypeError):
        return False


def service_label(root):
    return "com.harness.loop." + hashlib.sha1(str(Path(root).resolve()).encode()).hexdigest()[:10]


SERVICE_ENV = ("LOOP_", "HARNESS_", "GH_HOST")


def service_plist(root):
    return Path(runner.AGENTS) / f"{service_label(root)}.plist"


def cmd_start(root, a):
    home = home_of(root)
    home.mkdir(exist_ok=True)
    state = json.loads((home / "state.json").read_text()) if (home / "state.json").exists() else {}
    if state.get("running") and alive(state.get("pid")):
        print(f"The loop is already running (pid {state['pid']}). Dashboard: {state.get('dashboard', '?')}")
        return 0
    if a.resume:  # what the launchd service runs: a queued new run, else the run that died, else nothing
        queued = home / "next-run.json"
        if queued.exists():
            for k, v in json.loads(queued.read_text()).items():
                setattr(a, k, v)
            queued.unlink()
        elif (state.get("running") or state.get("crashed")) and state.get("opts"):
            if state.get("resumes", 0) >= MAX_RESUMES:
                state.update(running=False, crashed=False,
                             stop_reason=f"resumed {state['resumes']} times and it keeps dying; see loop.log")
                (home / "state.json").write_text(json.dumps(state, indent=2))
                print(f"Not resuming: {state['stop_reason']}")
                return 0
            for k, v in state["opts"].items():
                setattr(a, k, v)
            a.resuming = True
        else:
            print("Nothing to resume.")
            return 0
        a.foreground = True
    elif not a.foreground and service_plist(root).exists():
        # The service runs the loop, so launchd brings it back after a crash or a reboot.
        (home / "next-run.json").write_text(json.dumps({k: getattr(a, k) for k in OPT_KEYS}))
        run([runner.LAUNCHCTL, "kickstart", "-k", f"gui/{os.getuid()}/{service_label(root)}"], timeout=60)
        for _ in range(40):
            time.sleep(0.25)
            state = json.loads((home / "state.json").read_text()) if (home / "state.json").exists() else {}
            if state.get("running") and alive(state.get("pid")) and not (home / "next-run.json").exists():
                break
        print(f"Loop started by its service (pid {state.get('pid')}): {a.lanes} lanes, budget ${a.budget}.")
        print(f"Dashboard: {state.get('dashboard')}")
        return 0
    problems = []
    if git("status", "--porcelain", cwd=root).stdout.strip():
        problems.append("the project has uncommitted changes; commit or stash them first")
    if git("remote", "get-url", "origin", cwd=root, check=False).returncode != 0:
        problems.append("no GitHub remote `origin`: the loop opens a PR per feature")
    if run([GH, "auth", "status"], cwd=root).returncode != 0:
        problems.append("gh is not signed in (gh auth login)")
    if problems:
        for p in problems:
            print(f"Cannot start: {p}")
        return 1
    if a.milestone_budget:
        set_budgets(root, {ms: float(v) for ms, v in (x.split("=", 1) for x in a.milestone_budget)})
    if not a.foreground:  # detach, so the loop outlives the Claude session that started it
        if os.fork():
            for _ in range(40):  # wait until the detached loop has written its state
                time.sleep(0.25)
                state = json.loads((home / "state.json").read_text()) if (home / "state.json").exists() else {}
                if state.get("running") and alive(state.get("pid")) and "dashboard" in state:
                    break
            print(f"Loop started (pid {state.get('pid')}): {a.lanes} lanes, budget ${a.budget}.")
            print(f"Dashboard: {state.get('dashboard')}")
            return 0
        os.setsid()
        if os.fork():
            os._exit(0)
        log = open(home / "loop.log", "a")
        os.dup2(log.fileno(), 1)
        os.dup2(log.fileno(), 2)
        os.dup2(os.open(os.devnull, os.O_RDONLY), 0)
    loop = Loop(root, a)
    loop.state["dashboard"] = serve_dashboard(loop.home, root) if not a.no_dashboard else ""
    loop.save()
    loop.run()
    if not a.foreground:
        os._exit(0)
    return 0


def cmd_status(root, a):
    f = home_of(root) / "state.json"
    if not f.exists():
        print("The loop has not run in this project yet. Start it with /build.")
        return 0
    s = json.loads(f.read_text())
    if a.json:
        print(json.dumps(s, indent=2))
        return 0
    running = s.get("running") and alive(s.get("pid"))
    print(f"Loop: {'running' if running else 'stopped'}"
          + ("" if running else f" ({s.get('stop_reason') or 'no reason recorded'})")
          + f" · spent ${s.get('spent', 0):.2f} of ${s.get('budget', 0)}"
          + (f" (+ up to ${sum(c['max_cost'] for c in s['cut_off']):.2f} not reported by sessions stop --now cut off:"
             f" {', '.join(c['id'] for c in s['cut_off'])})" if s.get("cut_off") else "")
          + f" · dashboard {s.get('dashboard') or '-'}")
    if s.get("health"):
        print(f"  Health: {health.line(s['health'])} (as of {s.get('last_tick', '?')})")
    for job in sorted(s.get("jobs", {}).values(), key=lambda j: j["id"]):
        pr = f" #{job['pr']}" if job.get("pr") else ""
        print(f"  {job['id']:<7} {job['stage']:<12}{pr:<6} {job.get('title', '')[:50]}  {job.get('note') or ''}")
    budgets = json.loads((home_of(root) / "budgets.json").read_text()) if (home_of(root) / "budgets.json").exists() else {}
    for ms, spent in sorted(s.get("milestone_spent", {}).items()):
        print(f"  {ms} spent ${spent:.2f}" + (f" of ${budgets[ms]}" + (" (over budget)" if spent >= budgets[ms] else "")
                                             if ms in budgets else ""))
    for kind, n in s.get("repeated", {}).items():
        print(f"  repeated x{n}: {kind}")
    questions = [j for j in s.get("jobs", {}).values() if j.get("question")]
    if questions:
        print("\nWaiting on you:")
        for job in questions:
            print(f"  {job['id']}: {job['question']}")
    return 0


def cmd_drop(root, a):
    home = home_of(root)
    (home / f"answer-{a.job}-{int(time.time() * 1000)}.json").write_text(json.dumps({"id": a.job, "text": a.why, "drop": True}))
    print(f"{a.job} will be dropped; the loop applies it on its next tick (or its next start).")
    return 0


def write_answer(home, fid, text, drop=False):
    (home / f"answer-{fid}-{int(time.time() * 1000)}.json").write_text(
        json.dumps({"id": fid, "text": text, **({"drop": True} if drop else {})}))


def cmd_answer(root, a):
    write_answer(home_of(root), a.feature, a.text)
    print(f"Answer for {a.feature} recorded; the loop picks it up on its next tick.")
    return 0


def digest_for(home, state, days=7):
    def rows(name):
        f = home / name
        return [json.loads(x) for x in f.read_text().splitlines() if x.strip()] if f.exists() else []
    return owner.digest(rows("history.jsonl"), state, rows("feedback.jsonl"), days=days)


def cmd_metrics(root, a):
    c = metrics.card([home_of(root)])
    print(json.dumps(c, indent=2) if a.json else metrics.text(c))
    return 0


def cmd_forecast(root, a):
    """What the features still to build will likely cost, from this project's merged features (or the stack's
    prior with fewer than 5), plus each milestone's design doc. /build proposes the p80 as the budget."""
    home = home_of(root)
    state = json.loads((home / "state.json").read_text()) if (home / "state.json").exists() else {"jobs": {}}
    try:
        kind = json.loads((Path(root) / "harness/stack.json").read_text()).get("kind")
    except (OSError, ValueError):
        kind = None
    costs = [j.get("cost", 0) for j in state["jobs"].values() if FEATURE_ID.match(j["id"]) and j.get("stage") == "merged"]
    prior = len(costs) < 5
    p50 = PRIOR_COST.get(kind, 2.5) if prior else metrics.quantile(costs, 0.5)
    p80 = 1.8 * p50 if prior else metrics.quantile(costs, 0.8)
    todo = [f for f in backlog.read(root) if f.get("status") != "passing" and (not a.milestone or f.get("milestone") == a.milestone)]
    designed = {Path(d).stem for d in (Path(root) / "docs/design").glob("*.md")}
    designs = sorted({f.get("milestone") for f in todo if f.get("milestone") and f.get("type") != "bug"} - designed)
    low, high = len(todo) * p50 + DESIGN_COST * len(designs), len(todo) * p80 + DESIGN_COST * len(designs)
    print(f"{len(todo)} feature(s) to build" + (f" and {len(designs)} design doc(s) ({', '.join(designs)})" if designs else "")
          + f": about ${low:.0f}, ${high:.0f} at the 80th percentile ("
          + (f"no history yet: ${p50:.2f} a feature for a {kind or 'project'} like this" if prior
             else f"median ${p50:.2f}, p80 ${p80:.2f} from {len(costs)} merged features") + ").")
    print(f"Suggested: --budget {max(1, int(high + 0.999))}")
    return 0


def cmd_digest(root, a):
    f = home_of(root) / "state.json"
    print("\n".join(digest_for(home_of(root), json.loads(f.read_text()) if f.exists() else {}, a.days)))
    return 0


def cmd_service(root, a):
    """A launchd agent that runs the loop, so a crash or a reboot does not end a run (KeepAlive on failure only:
    a run that ends normally is not started again)."""
    plist, label, domain = service_plist(root), service_label(root), f"gui/{os.getuid()}"
    home = home_of(root)
    if a.action == "install":
        plist.parent.mkdir(parents=True, exist_ok=True)
        home.mkdir(exist_ok=True)
        plist.write_bytes(plistlib.dumps({
            "Label": label, "WorkingDirectory": str(root),
            "ProgramArguments": [sys.executable, str(Path(root) / "harness/loop.py"), "start", "--foreground", "--resume"],
            # The loop's own knobs set when the service is installed (LOOP_SANDBOX=1, say) stay set under launchd.
            "EnvironmentVariables": {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(Path.home()),
                                     **{k: v for k, v in os.environ.items() if k.startswith(SERVICE_ENV)}},
            "RunAtLoad": True, "KeepAlive": {"SuccessfulExit": False}, "ThrottleInterval": 60,
            "StandardOutPath": str(home / "launchd.log"), "StandardErrorPath": str(home / "launchd.log")}))
        r = run([runner.LAUNCHCTL, "bootstrap", domain, str(plist)], timeout=60)
        print(f"Installed {plist}" + ("" if r.returncode == 0 else f" (launchctl: {(r.stderr or r.stdout).strip()[:200]})")
              + ". From now on /build starts the loop through it, and it resumes a run after a crash or a reboot.")
        return 0
    if a.action == "uninstall":
        run([runner.LAUNCHCTL, "bootout", f"{domain}/{label}"], timeout=60)
        plist.unlink(missing_ok=True)
        print("The service is removed; the loop runs as a plain background process again.")
        return 0
    loaded = run([runner.LAUNCHCTL, "print", f"{domain}/{label}"], timeout=30).returncode == 0
    print(f"Service {label}: " + ("installed" if plist.exists() else "not installed") + (", loaded" if loaded else ""))
    return 0


def cmd_runner(root, a):
    home = home_of(root)
    home.mkdir(exist_ok=True)
    f = home / "runner.json"
    if a.action in ("on", "off"):
        f.write_text(json.dumps({"restart": a.action == "on"}) + "\n")
    on = f.exists() and json.loads(f.read_text()).get("restart")
    print(f"The loop {'restarts' if on else 'does not restart'} a stuck self-hosted runner"
          + (" (at most 3 times a run, 10 minutes apart)." if on else "; it tells you instead."))
    return 0


def cmd_notify(root, a):
    home = home_of(root)
    home.mkdir(exist_ok=True)
    if a.action == "set":
        cfg = notify.setup(home, a.url, a.detail)
        print(f"Pushes go to {cfg['url']}/{cfg['topic']}. Install the ntfy app (iOS or Android), tap +, and subscribe "
              f"to the topic {cfg['topic']}" + ("" if cfg["url"] == notify.DEFAULT_URL else f" on server {cfg['url']}")
              + ". Keep the topic private: whoever knows it can read the pushes. Then run: loop.py notify test")
        return 0
    if a.action == "off":
        (home / "notify.json").unlink(missing_ok=True)
        print("Pushes are off.")
        return 0
    cfg = notify.config(home)
    if not cfg:
        print("Pushes are not set up. Run: loop.py notify set")
        return 1
    ok = notify.post(cfg, "Harness loop", "Test push: pushes from this project's build loop reach this phone.")
    print("Sent; check the phone." if ok else f"Could not reach {cfg['url']}; check the network or the server.")
    return 0 if ok else 1


def set_budgets(root, pairs):
    f = home_of(root) / "budgets.json"
    f.parent.mkdir(exist_ok=True)
    budgets = json.loads(f.read_text()) if f.exists() else {}
    budgets.update(pairs)
    f.write_text(json.dumps(budgets, indent=2))
    return budgets


def cmd_budget(root, a):
    set_budgets(root, {a.milestone: a.dollars})
    print(f"Budget for {a.milestone}: ${a.dollars} (spent across runs; the loop reads it on its next tick).")
    return 0


def cmd_stop(root, a):
    home = home_of(root)
    state = json.loads((home / "state.json").read_text()) if (home / "state.json").exists() else {}
    if not (state.get("running") and alive(state.get("pid"))):
        print("The loop is not running.")
        return 0
    if a.now:
        os.kill(int(state["pid"]), signal.SIGTERM)
        print("Stopped. Sessions in progress were cut off; their features go back in the queue next time.")
    else:
        (home / "stop").write_text("stop\n")
        print("The loop takes no new work and stops once the running sessions finish.")
    return 0


def cmd_events(root, a):
    f = home_of(root) / "events.log"
    f.touch()
    with f.open() as fh:
        lines = fh.read().splitlines()
        if not a.follow:
            print("\n".join(lines[-40:]))
            return 0
        fh.seek(0, 2)
        while True:
            line = fh.readline()
            if line:
                print(line.rstrip(), flush=True)
            else:
                time.sleep(1)


def main():
    p = argparse.ArgumentParser(prog="loop.py")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("start")
    s.add_argument("--lanes", type=int, default=3)
    s.add_argument("--budget", type=float, default=10.0)
    s.add_argument("--milestone")
    s.add_argument("--milestone-budget", action="append", default=[], metavar="M1=20")
    s.add_argument("--session-budget", type=float, default=3.0)
    s.add_argument("--model", default="sonnet")
    s.add_argument("--large-model", default="opus")
    s.add_argument("--retries", type=int, default=2)
    s.add_argument("--port-base", type=int, default=43100)
    s.add_argument("--foreground", action="store_true")
    s.add_argument("--no-dashboard", action="store_true")
    s.add_argument("--resume", action="store_true", help="go on with a run that died, or one queued for the service")
    sv = sub.add_parser("service")
    sv.add_argument("action", choices=["install", "uninstall", "status"])
    st = sub.add_parser("status")
    st.add_argument("--json", action="store_true")
    dr = sub.add_parser("drop")
    dr.add_argument("job")
    dr.add_argument("why")
    an = sub.add_parser("answer")
    an.add_argument("feature")
    an.add_argument("text")
    sp = sub.add_parser("stop")
    sp.add_argument("--now", action="store_true")
    bu = sub.add_parser("budget")
    bu.add_argument("milestone")
    bu.add_argument("dollars", type=float)
    ev = sub.add_parser("events")
    ev.add_argument("--follow", action="store_true")
    me = sub.add_parser("metrics")
    me.add_argument("--json", action="store_true")
    fc = sub.add_parser("forecast")
    fc.add_argument("--milestone")
    dg = sub.add_parser("digest")
    dg.add_argument("--days", type=int, default=7)
    ru = sub.add_parser("runner")
    ru.add_argument("action", choices=["on", "off", "status"])
    no = sub.add_parser("notify")
    no.add_argument("action", choices=["set", "test", "off"])
    no.add_argument("--url", default=notify.DEFAULT_URL)
    no.add_argument("--detail", action="store_true", help="send the full question, not just a line")
    a = p.parse_args()
    root = Path(git("rev-parse", "--show-toplevel").stdout.strip())
    return {"start": cmd_start, "status": cmd_status, "answer": cmd_answer, "drop": cmd_drop, "stop": cmd_stop, "budget": cmd_budget,
            "events": cmd_events, "digest": cmd_digest, "notify": cmd_notify,
            "runner": cmd_runner, "service": cmd_service, "metrics": cmd_metrics,
            "forecast": cmd_forecast}[a.cmd](root, a)


if __name__ == "__main__":
    sys.exit(main())
