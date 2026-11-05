"""Constants and helpers shared by the loop's modules (loop.py, scheduler.py, agents.py, stages.py, merge.py):
running commands, git and gh, the network checks, and the settings the loop reads from the environment."""

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
import urllib.parse
import zoneinfo
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backlog  # noqa: E402
import ci_log  # noqa: E402
import health  # noqa: E402
import github  # noqa: E402
import history  # noqa: E402
import lang  # noqa: E402
import metrics  # noqa: E402
import notify  # noqa: E402
import owner  # noqa: E402
import preview  # noqa: E402
import runner  # noqa: E402
import stream  # noqa: E402
import watch  # noqa: E402

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
# Sessions stream what they do (stream-json) for the dashboard; LOOP_STREAM=0 goes back to one JSON at the end.
STREAM = os.environ.get("LOOP_STREAM", "1") != "0"
MIGRATIONS = ("supabase/migrations", "drizzle", "migrations", "db/migrations")  # where the presets keep SQL migrations
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


def final_result(lines):
    """The session's `result` object: the last line of stream-json, or the one JSON of --output-format json."""
    for line in reversed(lines):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("type") == "result":
            return d
    try:  # a json result printed over several lines
        d = json.loads("".join(lines))
        return d if isinstance(d, dict) else None
    except ValueError:
        return None


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
