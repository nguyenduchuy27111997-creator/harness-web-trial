#!/usr/bin/env python3
"""The build loop: builds ready features in parallel, one branch and one PR per
feature, and merges each PR itself once it is green. See DESIGN.md section 10.

  loop.py start [--lanes 4] [--budget 10] [--milestone M1] [--foreground]
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

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
# The loop is split into modules (DESIGN.md 15.5, P25); loop.X still names every shared constant and helper.
from common import *  # noqa: E402,F401,F403
import agents  # noqa: E402
import common  # noqa: E402
import dispatcher  # noqa: E402
import merge  # noqa: E402
import scheduler  # noqa: E402
import stages  # noqa: E402


class Loop(scheduler.Scheduler, agents.Agents, stages.Stages, merge.Merge, dispatcher.Dispatcher):
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
        self.watch = watch.Watch()  # alerts: quiet, going in circles, red tests, context, budget (watch.py)
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
        for k in ("stop_now", "probe_failing", "probe_since", "infra_since"):  # nor a give-up on Docker or the API
            state.pop(k, None)
        state["runner_restarts"] = []
        if getattr(self.opts, "resuming", False):  # the same run goes on: its start, spend and budget stay
            state["resumes"] = state.get("resumes", 0) + 1
            state.pop("crashed", None)
            state.update(running=True, stop_reason="", pid=os.getpid(), team={})  # no session of the last run is at work
            return state
        state.update(started=now(), spent=0.0, cut_off=[], budget=self.opts.budget, lanes=self.opts.lanes,
                     milestone=self.opts.milestone, running=True, stop_reason="", pid=os.getpid(), resumes=0, team={},
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
        stream.BUS.publish({"job": fid, "role": "loop", "kind": "event", "text": text})

    def job(self, fid):
        return self.state["jobs"].get(fid)

    def set_stage(self, job, stage, note=None, question=None):
        job["stage"], job["updated"] = stage, now()
        if note is not None:
            job["note"] = note
        job["question"] = question
        self.event(job["id"], f"{stage}" + (f": {note}" if note else ""))
        self.outcome(job, stage, note)  # what came of the dispatcher's advice, if it was asked
        self.consult(job, stage)  # and its advice on this stage, if it is one it is asked about
        stream.BUS.publish({"job": job["id"], "role": "loop", "kind": "stage", "stage": stage, "note": job.get("note"),
                            "question": question})
        if stage in WAITING_HUMAN and question:
            key = f"ask:{job['id']}:{hashlib.sha1(question.encode()).hexdigest()[:8]}"
            detail = (notify.config(self.home) or {}).get("detail")
            line = question if detail else f"{job.get('title', '')}: {job.get('note') or stage}"
            if stage != "reverted" and ASK_EVERY and time.time() - self.state.get("asked_at", 0) < ASK_EVERY:
                # Not urgent: it goes out with the others at most every LOOP_ASK_EVERY (P32). A red main is pushed now.
                self.state.setdefault("ask_queue", {})[key] = {"id": job["id"], "line": line, "click": job.get("pr_url")}
            else:
                self.state["asked_at"] = time.time()
                self.push(key, lang.say("{id} needs you", id=job["id"]), line, priority=4, click=job.get("pr_url"))
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
        notify.desktop(title, message)

    def flush_questions(self):
        """The questions held back since the last push, as one push, once LOOP_ASK_EVERY has passed (or the loop
        stops). One already answered, or no longer waiting, is left out."""
        queue = self.state.get("ask_queue") or {}
        if not queue or (time.time() - self.state.get("asked_at", 0) < ASK_EVERY and not self.state.get("stop_reason")):
            return
        self.state["ask_queue"] = {}
        live = {k: q for k, q in queue.items() if (self.job(q["id"]) or {}).get("stage") in WAITING_HUMAN}
        if not live:
            return
        self.state["asked_at"] = time.time()
        if len(live) == 1:
            (key, q), = live.items()
            return self.push(key, lang.say("{id} needs you", id=q["id"]), q["line"], priority=4, click=q["click"])
        self.push("asks:" + hashlib.sha1("".join(sorted(live)).encode()).hexdigest()[:8],
                  lang.say("{n} questions need you", n=len(live)), "\n".join(f"{q['id']}: {q['line']}" for q in live.values())[:1500],
                  priority=4)
        self.state.setdefault("notified", {}).update({k: now() for k in live})

    def quality_path(self, fid, fresh=False):
        """Where a session's check writes its numbers; emptied when a session starts, so old numbers are never new."""
        f = self.home / "quality" / f"{fid}.json"
        if fresh:
            f.parent.mkdir(parents=True, exist_ok=True)
            f.unlink(missing_ok=True)
        return f

    def keep_history(self):
        """Hourly, the old streams and films go (history.py). And once a day, the days before today that have no
        summary yet get one: Claude's when the budget has room for it, else one made from the numbers. What the
        office's questions cost (ask.py, asked through the dashboard) is added to the spend here. "spent" is this
        run's, against its budget; "spent_today" is the day's by every run, so the office's panel does not read $0
        after a restart."""
        asked = round(sum(a.get("cost", 0) for a in ask.asked(self.home)), 4)
        if asked > self.state.get("ask_spent", 0):
            self.state["spent"] = round(self.state["spent"] + asked - self.state.get("ask_spent", 0), 4)
            self.state["ask_spent"] = asked
        self.state["spent_today"] = round(self.spent_today(), 2)
        if time.time() - getattr(self, "pruned", 0) > 3600:
            self.pruned = time.time()
            history.prune(self.home)
        self.recaps()
        today = datetime.date.today().isoformat()
        if self.state.get("summary_day") == today:
            return
        last = self.state.get("summary_day") or (datetime.date.today() - datetime.timedelta(days=2)).isoformat()
        self.state["summary_day"] = today
        for d in sorted(x["day"] for x in history.days(self.home) if last <= x["day"] < today and not x["summary"])[-3:]:
            room = self.state["spent"] + history.SUMMARY_COST <= self.state["budget"]
            cost = history.summarize(self.home, self.state, d, claude=CLAUDE, room=room)
            self.state["spent"] = round(self.state["spent"] + cost, 4)
            self.event("loop", f"summary of {d} written" + (f" (${cost:.2f})" if cost else ""))

    def recaps(self):
        """The History tab's films (recap.py): one at a time, in the background, while the machine has room. A film
        that cannot be made (no ffmpeg, say or Chrome, or ffmpeg failed) is not tried again this run."""
        if self.busy or getattr(self, "filming", None) and self.filming.is_alive():
            return
        tried = self.__dict__.setdefault("films_tried", set())
        todo = [w for w in recap.wanted(self.home, self.state) if w not in tried]
        if not todo:
            return
        tried.add(todo[0])
        state = json.loads(json.dumps(self.state))

        def run():
            try:
                out = recap.make(self.home, self.root, state, todo[0])
            except (OSError, ValueError, KeyError, subprocess.SubprocessError):
                out = None
            self.event("loop", f"film of {todo[0][1]} made" if out else f"no film of {todo[0][1]} (needs ffmpeg, say and Chrome)")
        self.filming = threading.Thread(target=run, daemon=True)
        self.filming.start()

    def alerts(self):
        """What watch.py sees, on the bus for the office and pushed (ntfy and macOS) at most every 30 minutes."""
        if os.environ.get("LOOP_ALERTS") == "0":
            return
        with stream.BUS.cond:
            events = list(stream.BUS.events)
        for a in self.watch.check(events, self.state, self.home / "tests"):
            stream.BUS.publish({"role": "loop", "kind": "alert", **a})
            self.event(a["job"], f"alert: {a['detail']}")
            self.push(f"alert:{a['job']}:{a['rule']}:{int(time.time() // 1800)}",
                      lang.say("{id}: {detail}", id=a["job"], detail=lang.say(a["detail_key"], **a["params"])),
                      lang.say(a["hint_key"], **a["params"]))

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
            self.push(f"sample:{job['id']}", lang.say("Check {id} against what you meant", id=job["id"]),
                      lang.say("{title}. Looks right? Comment /ok, or /bug <what is off>, on the PR.", title=job["title"]), click=job.get("pr_url"))

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
                self.push(f"runner:{self.state['started']}", lang.say("CI runner stuck"),
                          lang.say("{why}. Restart it, or allow the loop to: loop.py runner on.", why=why), priority=4)
            return
        if len(restarts) >= 3:
            if not self.state.get("ci_stalled"):
                self.state["ci_stalled"] = why
                self.event("loop", f"ci stalled: the runner is still stuck after 3 restarts ({why}); nothing new starts")
                self.push(f"stalled:{self.state['started']}", lang.say("CI runner still stuck"),
                          lang.say("{why}, after 3 restarts. Check the Mac and the runner.", why=why), priority=5)
            return
        if restarts and time.time() - restarts[-1] < RUNNER_RESTART_GAP:
            return
        hard = bool(restarts)
        for plist in plists:
            runner.restart(plist, hard=hard)
        restarts.append(time.time())
        self.event("loop", f"runner: {why}; restarted its service ({'bootout and bootstrap' if hard else 'kickstart'})")

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
                        self.push(f"offline:{int(offline)}", lang.say("Loop offline"),
                                  lang.say("GitHub unreachable since {since}; the loop waits and goes on by itself.", since=self.state["offline_since"]))
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
            preview.PREVIEW.shutdown()  # nor their QA Chrome and dev servers
            self.state["running"] = False
            self.state["stop_reason"] = self.state.get("stop_reason") or "the loop ended unexpectedly"
            self.save()
            self.write_history()
            self.event("loop", f"stopped: {self.state['stop_reason']} · spent ${self.state['spent']:.2f}")
            self.flush_questions()  # what was held back goes out now
            self.push(f"end:{self.state['started']}", lang.say("Loop stopped: {why}", why=self.state["stop_reason"])[:120],
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
        preview.PREVIEW.shutdown()  # their QA Chrome and dev servers too: os._exit skips the run's own clean-up
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
    office = Path(__file__).resolve().parent / "office"  # the 3D view, built from the kit's viewer/

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
            if host not in ("localhost", "127.0.0.1"):  # another site's page reaching this server by DNS rebinding
                self.send_error(403)
                return
            if path == "/stream":  # ?after=<id> for a page that read /snapshot.json first
                after = re.search(r"[?&]after=(\d+)", self.path)
                with preview.PREVIEW.viewer():  # someone has the office open: the lanes' apps run for it
                    self.events(int(self.headers.get("Last-Event-ID") or (after.group(1) if after else 0)))
                return
            if re.fullmatch(r"/cam/[A-Za-z0-9_-]+", path):  # the lane's app (or ?view=qa, QA's browser) as the camera sees it
                view = "qa" if "view=qa" in self.path else "app"
                with preview.PREVIEW.watch(path.split("/")[2], view):
                    self.frames(path.split("/")[2], view)
                return
            if path == "/":
                body, kind = page.read_bytes(), "text/html; charset=utf-8"
            elif path == "/state.json":
                f = home / "state.json"
                body, kind = (f.read_bytes() if f.exists() else b"{}"), "application/json"
            elif path == "/history.json":
                f = home / "history.jsonl"
                rows = [json.loads(line) for line in f.read_text().splitlines()[-50:]] if f.exists() else []
                body, kind = json.dumps(rows).encode(), "application/json"
            elif path == "/team.json":  # the agent team for the office: who is at work, per role, the dispatcher (P33)
                body, kind = json.dumps(dispatcher.team(home)).encode(), "application/json"
            elif path == "/metrics.json":
                body, kind = json.dumps(metrics.card([home])).encode(), "application/json"
            elif path == "/health.json":
                f = home / "state.json"
                s = json.loads(f.read_text()) if f.exists() else {}
                body = json.dumps({**(s.get("health") or {}), "last_tick": s.get("last_tick"),
                                   "running": bool(s.get("running") and alive(s.get("pid")))}).encode()
                kind = "application/json"
            elif path in ("/office", "/office/") or re.fullmatch(r"/office/(assets/[\w.-]+\.(esm|css)|models/\w+\.(glb|png))", path):
                f = office / ("index.html" if path.rstrip("/") == "/office" else path[len("/office/"):])
                if not f.exists():
                    self.send_error(404)
                    return
                body = f.read_bytes()
                kind = {".html": "text/html; charset=utf-8", ".esm": "text/javascript", ".css": "text/css",
                        ".glb": "model/gltf-binary", ".png": "image/png"}[f.suffix]
            elif path == "/history/days.json":  # the days the office can replay (history.py)
                body, kind = json.dumps(history.days(home)).encode(), "application/json"
            elif re.fullmatch(r"/(ci|pr)/[A-Za-z0-9_-]+\.json", path):  # a lane's CI steps or its PR (github.py), while Focus shows it
                f = home / "state.json"
                j = (json.loads(f.read_text()) if f.exists() else {}).get("jobs", {}).get(path.split("/")[2][:-5])
                call_gh = lambda *a: gh(*a, cwd=root, check=False)  # noqa: E731
                found = j and (github.ci(call_gh, j["branch"], log="log=1" in self.path) if path.startswith("/ci/") and j.get("branch")
                               else github.pr(call_gh, j["pr"]) if path.startswith("/pr/") and j.get("pr") else None)
                if not found:
                    self.send_error(404)
                    return
                body, kind = json.dumps(found).encode(), "application/json"
            elif path == "/tree.json":  # the files and their lines, of main or of a lane's worktree (?job=F020)
                job = re.search(r"[?&]job=([A-Za-z0-9_-]+)", self.path)
                f = home / "state.json"
                jobs = (json.loads(f.read_text()) if f.exists() else {}).get("jobs", {})
                wt = (jobs.get(job.group(1)) or {}).get("worktree") if job else None
                where = Path(wt) if wt and Path(wt).is_dir() else root
                body, kind = json.dumps(history.tree(where)).encode(), "application/json"
            elif path == "/milestone.json":  # the milestone in progress: its clock and why each feature waits (P38)
                f = home / "state.json"
                body = json.dumps(history.milestone(root, home, json.loads(f.read_text()) if f.exists() else {})).encode()
                kind = "application/json"
            elif path == "/roadmap.json":  # the backlog, milestones and what starts next (history.py)
                f = home / "state.json"
                body = json.dumps(history.roadmap(root, home, json.loads(f.read_text()) if f.exists() else {})).encode()
                kind = "application/json"
            elif path == "/history/stats.json":
                f = home / "state.json"
                body = json.dumps(history.stats(home, json.loads(f.read_text()) if f.exists() else {})).encode()
                kind = "application/json"
            elif re.fullmatch(r"/history/\d{4}-\d\d-\d\d\.json", path):  # ?job=F020 keeps that job's streamed code
                job = re.search(r"[?&]job=([A-Za-z0-9_-]+)", self.path)
                try:
                    body = json.dumps(history.day_events(home, path[9:19], job.group(1) if job else None)).encode()
                except ValueError:  # 2026-99-99
                    self.send_error(404)
                    return
                kind = "application/json"
            elif path == "/history/records.json":  # the office's records (history.records)
                f = home / "state.json"
                body, kind = json.dumps(history.records(home, json.loads(f.read_text()) if f.exists() else {})).encode(), "application/json"
            elif path == "/history/recaps.json":  # the films there are (recap.py)
                body, kind = json.dumps(recap.made(home)).encode(), "application/json"
            elif re.fullmatch(r"/history/recap/(F\d{3}|[DL]-[A-Za-z0-9]+|\d{4}-\d\d-\d\d)\.mp4", path):
                f = home / "history" / "recap" / path.rsplit("/", 1)[1]
                if not f.exists():
                    self.send_error(404)
                    return
                self.video(f)
                return
            elif re.fullmatch(r"/history/summary/\d{4}-\d\d-\d\d", path):
                f = home / "history" / "summary" / f"{path[-10:]}.md"
                if not f.exists():
                    self.send_error(404)
                    return
                body, kind = f.read_bytes(), "text/markdown; charset=utf-8"
            elif path == "/snapshot.json":
                f = home / "state.json"
                body = json.dumps({"state": json.loads(f.read_text()) if f.exists() else {}, **stream.BUS.snapshot(),
                                   "ask_token": ask.token(home)}).encode()  # another site's page cannot read it
                kind = "application/json"
            elif path == "/ask.json":  # the questions asked so far and what is left of today's cap
                body = json.dumps({"asked": ask.asked(home)[-30:], "left": round(ask.DAY_CAP - history.SUMMARY_COST - ask.spent(home), 2)}).encode()
                kind = "application/json"
            elif re.fullmatch(r"/design/[A-Za-z0-9_-]+", path):  # the lane's design doc as it is now, for the whiteboard
                state = json.loads((home / "state.json").read_text())
                j = state["jobs"].get(path.split("/")[2])
                wt = Path(j["worktree"]) if j and Path(j.get("worktree", "")).is_dir() else Path(root)
                docs = sorted((wt / "docs/design").glob("*.md"), key=lambda f: f.stat().st_mtime)
                if not docs:
                    self.send_error(404)
                    return
                body, kind = docs[-1].read_bytes()[:200_000], "text/markdown; charset=utf-8"
            elif re.fullmatch(r"/diff/[A-Za-z0-9_-]+", path):
                state = json.loads((home / "state.json").read_text())
                j = state["jobs"].get(path.split("/")[2])
                if not j or not Path(j.get("worktree", "")).is_dir():
                    self.send_error(404)
                    return
                diff = run(["git", "diff", j.get("base") or "main", "--"], cwd=j["worktree"], check=False).stdout
                body, kind = diff[:200_000].encode(), "text/plain; charset=utf-8"
            elif re.fullmatch(r"/file/[A-Za-z0-9_-]+", path):  # a file in the lane's worktree, for the office's editor
                state = json.loads((home / "state.json").read_text())
                j = state["jobs"].get(path.split("/")[2])
                q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("path", [""])[0]
                wt = Path(j["worktree"]).resolve() if j and Path(j.get("worktree", "")).is_dir() else None
                f = (wt / q).resolve() if wt and q else None
                if not f or not f.is_relative_to(wt) or ".git" in f.relative_to(wt).parts or f.name.startswith(".env") \
                        or not f.is_file() or f.stat().st_size > 200_000:
                    self.send_error(404)
                    return
                body, kind = stream.mask_whole(f.read_text(errors="replace")).encode(), "text/plain; charset=utf-8"
            elif re.fullmatch(r"/schema/[A-Za-z0-9_-]+", path):  # the lane's migrations, for the office's schema board
                state = json.loads((home / "state.json").read_text())
                j = state["jobs"].get(path.split("/")[2])
                wt = Path(j["worktree"]) if j and Path(j.get("worktree", "")).is_dir() else Path(root)
                dirs = [d for d in MIGRATIONS if (wt / d).is_dir()]
                changed = set(run(["git", "diff", "--name-only", (j or {}).get("base") or "main", "--", *dirs], cwd=wt, check=False).stdout.split()) if dirs else set()
                changed |= set(run(["git", "ls-files", "--others", "--exclude-standard", "--", *dirs], cwd=wt, check=False).stdout.split()) if dirs else set()
                files = [{"name": f.name, "sql": f.read_text(errors="replace")[:100_000], "fresh": str(f.relative_to(wt)) in changed}
                         for d in dirs for f in sorted((wt / d).glob("*.sql"))]
                body, kind = json.dumps({"files": files}).encode(), "application/json"
            elif re.fullmatch(r"/film/[A-Za-z0-9_-]+\.json", path):  # the lane's film: a still after each save
                f = home / "film" / path[6:-5] / "index.jsonl"
                rows = [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []
                body, kind = json.dumps(rows).encode(), "application/json"
            elif re.fullmatch(r"/film/[A-Za-z0-9_-]+/\d+m?\.jpg", path):  # "m": the phone
                f = home / path[1:]
                if not f.exists():
                    self.send_error(404)
                    return
                body, kind = f.read_bytes(), "image/jpeg"
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

        def video(self, f):
            """An MP4 with byte ranges, so the page's player can seek."""
            size = f.stat().st_size
            m = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
            start = int(m.group(1)) if m and m.group(1) else 0
            end = min(int(m.group(2)), size - 1) if m and m.group(2) else size - 1
            with f.open("rb") as fh:
                fh.seek(start)
                body = fh.read(end - start + 1)
            self.send_response(206 if m else 200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(len(body)))
            if m:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            """POST /ask {q, job?}: a question to the office (ask.py); POST /answer {job, text}: the owner's answer to a
            job that waits on them, as `loop.py answer` gives it (P38). From the dashboard's own page only."""
            host = self.headers.get("Host") or ""
            origin = self.headers.get("Origin") or ""
            if self.path not in ("/ask", "/answer"):
                self.send_error(404)
                return
            if host.rsplit(":", 1)[0] not in ("localhost", "127.0.0.1") or origin != f"http://{host}" \
                    or not secrets.compare_digest(self.headers.get("X-Office-Token") or "", ask.token(home)):
                self.send_error(403)
                return
            if self.path == "/answer":
                return self.answer()
            try:
                d = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 4000)))
                q, job = str(d["q"]).strip(), d.get("job")
            except (ValueError, KeyError, TypeError):
                self.send_error(400)
                return
            if not q or (job is not None and not re.fullmatch(r"[A-Za-z0-9_-]+", str(job))):
                self.send_error(400)
                return
            f = home / "state.json"
            body = json.dumps(ask.answer(home, json.loads(f.read_text()) if f.exists() else {}, q, job, claude=CLAUDE)).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def answer(self):
            try:
                d = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 4000)))
                job, text = str(d["job"]), str(d["text"]).strip()
            except (ValueError, KeyError, TypeError):
                self.send_error(400)
                return
            f = home / "state.json"
            st = json.loads(f.read_text()) if f.exists() else {}
            if not re.fullmatch(r"[A-Za-z0-9_-]+", job) or not text \
                    or (st.get("jobs", {}).get(job) or {}).get("stage") not in WAITING_HUMAN:
                self.send_error(400)  # only a job that waits on the owner takes an answer
                return
            write_answer(home, job, text)
            body = json.dumps({"ok": True, "running": bool(st.get("running"))}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def frames(self, job, view):
            """Server-sent JPEG frames of the lane's app, while the page watches."""
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            seq = 0
            try:
                while True:
                    f = preview.PREVIEW.frame_after(job, seq, view)
                    if f and f[0] > seq:
                        seq = f[0]
                        self.wfile.write(f"data: {json.dumps({'url': f[2], 'jpeg': f[1]})}\n\n".encode())
                    else:
                        self.wfile.write(b": idle\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                return

        def events(self, last):
            """Server-sent events from the bus, from the one after `last`, until the page goes away."""
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                while True:
                    batch = stream.BUS.since(last, timeout=15)
                    chunk = "".join(f"id: {e['id']}\ndata: {json.dumps(e)}\n\n" for e in batch) or ": idle\n\n"
                    self.wfile.write(chunk.encode())
                    self.wfile.flush()
                    last = batch[-1]["id"] if batch else last
            except (BrokenPipeError, ConnectionResetError, OSError):
                return

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
    notify.DESKTOP = os.environ.get("LOOP_DESKTOP", "1") != "0"
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
        # No loop runs (checked above), so no -k; and no waiting on launchctl, which once hung for 60 s.
        subprocess.Popen([runner.LAUNCHCTL, "kickstart", f"gui/{os.getuid()}/{service_label(root)}"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        for _ in range(240):
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
    # The lanes' apps and QA's Chrome are for the office to show: without a dashboard there is no office. The kit's own
    # tests run that way, and each session there opened a headless Chrome that nobody could see.
    preview.PREVIEW.configure(root, loop.home, loop.stack.get("verify", "browser") == "browser" and not a.no_dashboard)
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


def cmd_answer(root, a):
    home = home_of(root)
    write_answer(home, a.feature, a.text)
    state = json.loads((home / "state.json").read_text()) if (home / "state.json").exists() else {}
    if (state.get("running") and alive(state.get("pid"))) or not ANSWER_STARTS:
        print(f"Answer for {a.feature} recorded; the loop picks it up on its next tick.")
        return 0
    # Seen on the web trial: the loop had stopped, waiting on the owner, and an answer sat unread for 10 minutes until
    # someone restarted it. A stopped loop starts again with the last run's options to act on it.
    opts = state.get("opts") or {}
    flags = [x for k, v in opts.items() if v is not None and k in OPT_KEYS for x in (f"--{k.replace('_', '-')}", str(v))]
    subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "start", *flags], cwd=root,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    print(f"Answer for {a.feature} recorded. The loop was stopped: it starts again now to act on it"
          + (f" ({' '.join(flags)})." if flags else "."))
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


def cmd_decisions(root, a):
    print(dispatcher.report(home_of(root)))
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
    s.add_argument("--lanes", type=int, default=4)  # the most: a loaded machine gets LOOP_MIN_LANES (2)
    s.add_argument("--budget", type=float, default=10.0)
    s.add_argument("--milestone")
    s.add_argument("--milestone-budget", action="append", default=[], metavar="M1=20")
    s.add_argument("--session-budget", type=float, default=3.0)
    s.add_argument("--model", default="sonnet")
    s.add_argument("--large-model", default="opus")
    s.add_argument("--retries", type=int, default=3)  # one try per rung of the model ladder (agents.rung)
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
    sub.add_parser("decisions")  # the dispatcher's advice beside what happened (LOOP_DISPATCHER=suggest)
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
            "forecast": cmd_forecast, "decisions": cmd_decisions}[a.cmd](root, a)


if __name__ == "__main__":
    sys.exit(main())
