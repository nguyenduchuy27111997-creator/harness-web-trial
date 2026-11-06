"""The lane's app, live, for the office's Focus view (DESIGN.md 14.12). Only while someone has the office open:
the lane's dev server (its ./init.sh on the lane's PORT, for a building or fixing session) and one headless Chrome
(cam.mjs) that signs in as the office's own test user, opens the page of the file the agent is editing and
screencasts it while someone watches that lane. The loop comes first: nothing new starts while the machine is busy,
and frames slow down. A dev server stops with its session (the loop stops what a session leaves in its worktree).
Each save leaves a still in the lane's film (<home>/film/<job>/), and a session that starts while the office is open
gets its own headless Chrome for the Playwright MCP (over CDP), so the camera can watch QA drive it. Every session's
test runs report each test (harness/reporters/, to $HARNESS_TESTS), and the kit's dev server logs each request: both
go on the bus while someone watches."""
import base64
import collections
import contextlib
import datetime
import http.client
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import threading
import time
from pathlib import Path

import history  # noqa: E402
import stream

IDLE = 180  # seconds with nobody watching before Chrome closes
LANE_STAGES = ("building", "fixing")
CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "google-chrome-stable",
          "chromium", "chromium-browser"]


REQUEST = re.compile(r"^\s*(GET|POST|PUT|PATCH|DELETE) (\S+) (\d{3}) in ([\d.]+)(ms|s)\b")
ACTION = re.compile(r"^\s*\W*ƒ (\w+)\(.*\) in ([\d.]+)(ms|s)\b(?:\s+(\S+))?")
QUIET = ("/api/harness-health", "/_next/", "/__nextjs", "/favicon")


def request(line):
    """A line of `next dev` output as a request (or the server action it ran), or None."""
    m = REQUEST.match(line)
    if m and not m.group(2).startswith(QUIET):
        ms = float(m.group(4)) * (1000 if m.group(5) == "s" else 1)
        return {"method": m.group(1), "path": m.group(2)[:200], "status": int(m.group(3)), "ms": round(ms)}
    m = ACTION.match(line)
    if m:
        ms = float(m.group(2)) * (1000 if m.group(3) == "s" else 1)
        return {"method": "ACTION", "path": m.group(1), "status": 0, "ms": round(ms), "file": m.group(4) or ""}
    return None


def test_event(line):
    """A line a kit reporter wrote (harness/reporters/): {event, name, file, status, ms}, or None."""
    try:
        d = json.loads(line)
    except ValueError:
        return None
    if not isinstance(d, dict) or d.get("event") not in ("begin", "end", "run"):
        return None
    return {k: (str(d[k])[:300] if isinstance(d[k], str) else d[k]) for k in ("event", "name", "file", "status", "ms", "runner") if k in d}


def chrome():
    return next((c for c in CHROME if (Path(c).exists() if c.startswith("/") else shutil.which(c))), None)


def serving(port):
    """Something answers HTTP on the port (any status below 500: a sign-in redirect is an app)."""
    try:
        c = http.client.HTTPConnection("localhost", port, timeout=2)
        c.request("GET", "/")
        ok = c.getresponse().status < 500
        c.close()
        return ok
    except OSError:
        return False


class Preview:
    def __init__(self):
        self.lock = threading.Condition()
        self.enabled, self.root, self.home = False, None, None
        self.viewers, self.seen = 0, 0.0
        self.lanes = {}  # job -> {port, wt, stage, dev, opened}
        self.watching = collections.Counter()
        self.frames = {}  # (job, view) -> (seq, jpeg as base64, url); view is "app" or "qa"
        self.cam, self.fps, self.follower, self.busy = None, 0, None, None
        self.qa = {}  # job -> (Chrome for its session's Playwright MCP, CDP endpoint)
        self.tails = {}  # job -> its session's token: the test file (and dev server log) are followed while it holds

    def configure(self, root, home, browser):
        self.root, self.home = Path(root), Path(home)
        self.enabled = browser and shutil.which("node") is not None

    # who is looking ------------------------------------------------------------------
    @contextlib.contextmanager
    def viewer(self):
        with self.lock:
            self.viewers += 1
            self.seen = time.time()
        try:
            yield
        finally:
            with self.lock:
                self.viewers -= 1
                self.seen = time.time()

    @contextlib.contextmanager
    def watch(self, job, view="app"):
        key = (job, view)
        with self.lock:
            self.watching[key] += 1
            first = self.watching[key] == 1
        if first:
            self.send({"op": "watch", "job": job, "view": view, "on": True})
        try:
            yield
        finally:
            with self.lock:
                self.watching[key] -= 1
                last = self.watching[key] <= 0
            if last:
                self.send({"op": "watch", "job": job, "view": view, "on": False})

    def frame_after(self, job, seq, view="app", timeout=15):
        with self.lock:
            self.lock.wait_for(lambda: self.frames.get((job, view), (0,))[0] > seq, timeout)
            return self.frames.get((job, view))

    # sessions ------------------------------------------------------------------------
    def qa_browser(self, job, wt):
        """A CDP endpoint for the session's Playwright MCP when the machine has room, else None (the MCP starts its own
        browser, as without the office). Whether anyone watches yet does not matter: the session's verifier opens a
        Chrome either way, and someone who opens the office mid-session then sees QA too; the camera attaches only then."""
        exe = chrome()
        if not (self.enabled and exe and not self.busy):
            return None
        port = free_port()
        profile = self.home / "qa" / job
        profile.mkdir(parents=True, exist_ok=True)
        proc = subprocess.Popen([exe, "--headless=new", f"--remote-debugging-port={port}", "--remote-debugging-address=127.0.0.1",
                                 f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check", "about:blank"],
                                cwd=wt, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                start_new_session=True)
        endpoint = f"http://127.0.0.1:{port}"
        for _ in range(50):
            with contextlib.suppress(OSError), contextlib.closing(http.client.HTTPConnection("127.0.0.1", port, timeout=1)) as c:
                c.request("GET", "/json/version")
                self.qa[job] = (proc, endpoint)
                return endpoint
            time.sleep(0.2)
        with contextlib.suppress(OSError):
            os.killpg(proc.pid, 15)
        return None

    def tests_path(self, job):
        """Where the session's test runs report each test ($HARNESS_TESTS), empty for each new session."""
        f = self.home / "tests" / f"{job}.jsonl"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("")
        return f

    def follow_file(self, job, f, parse, kind):
        """Lines added to `f` while the job's session runs, parsed and put on the bus while someone watches."""
        token = self.tails.get(job)

        def run():
            pos = f.stat().st_size if f.exists() else 0
            while token is not None and self.tails.get(job) is token:
                time.sleep(0.5)
                if not f.exists():
                    continue
                with f.open("rb") as fh:
                    fh.seek(pos)
                    chunk = fh.read()
                cut = chunk.rfind(b"\n") + 1  # whole lines only
                pos += cut
                if not self.viewers:
                    continue
                for line in chunk[:cut].decode(errors="replace").splitlines():
                    e = parse(line)
                    if e:
                        stream.BUS.publish({"job": job, "role": "main", "kind": kind, **e})
        threading.Thread(target=run, daemon=True).start()

    def session_start(self, job, port, wt, stage):
        self.tails[job] = object()
        self.follow_file(job, self.home / "tests" / f"{job}.jsonl", test_event, "test")
        if self.enabled and stage in LANE_STAGES:
            with self.lock:
                self.lanes[job] = {"port": port, "wt": Path(wt), "stage": stage, "dev": None, "opened": False}
        if job in self.qa and self.cam:
            self.send({"op": "qa", "job": job, "endpoint": self.qa[job][1]})

    def session_end(self, job):
        self.tails.pop(job, None)
        with self.lock:
            lane = self.lanes.pop(job, None)
        procs = [lane["dev"] if lane else None, self.qa.pop(job, (None,))[0]]
        for proc in filter(None, procs):
            with contextlib.suppress(OSError):
                os.killpg(proc.pid, 15)
        self.send({"op": "close", "job": job})

    # the film ------------------------------------------------------------------------
    def still(self, job, data, url, path, view="app"):
        """A frame after a save, kept for the lane's film: <n>.jpg, and <n>m.jpg for the phone on the same page."""
        folder = self.home / "film" / job
        folder.mkdir(parents=True, exist_ok=True)
        n = sum(1 for f in folder.glob("*.jpg") if f.stem.isdigit())
        if view == "mobile":
            if n:
                (folder / f"{n}m.jpg").write_bytes(base64.b64decode(data))
                stream.BUS.publish({"job": job, "role": "main", "kind": "still", "view": "mobile", "n": n, "url": url})
            return
        n += 1
        (folder / f"{n}.jpg").write_bytes(base64.b64decode(data))
        row = {"n": n, "at": datetime.datetime.now().isoformat(timespec="seconds"), "url": url, "path": path}
        with (folder / "index.jsonl").open("a") as f:
            f.write(json.dumps(row) + "\n")
        stream.BUS.publish({"job": job, "role": "main", "kind": "still", **row})
        self.prune()

    def prune(self):
        history.prune(self.home)  # films and streams: 30 days, 2 GB together, never the film being made

    def tick(self, busy):
        """From the loop's tick: start what the people watching need, unless the machine is busy."""
        if not self.enabled:
            return
        self.busy = busy
        with self.lock:
            viewers, seen, lanes = self.viewers, self.seen, dict(self.lanes)
        if not viewers:
            if self.cam and time.time() - seen > IDLE:
                self.stop()
            return
        # A lane someone has open in Focus gets its app even on a busy machine, at 1 fps (the owner's choice, 05/11/2026):
        # the office's own lanes nobody looks at still wait. LOOP_OFFICE_BUSY_CAM=0 keeps the camera off while busy.
        with self.lock:
            focused = {j for (j, v), n in self.watching.items() if n > 0 and v == "app"}
        let = lambda job: not busy or (job in focused and os.environ.get("LOOP_OFFICE_BUSY_CAM", "1") != "0")  # noqa: E731
        for job, lane in lanes.items():
            if not serving(lane["port"]):
                if let(job) and not lane["dev"] and (lane["wt"] / "init.sh").exists():
                    lane["dev"] = self.dev(job, lane)
                continue
            if not lane["opened"] and (self.cam or let(job)) and self.camera():
                lane["opened"] = True
                self.send({"op": "open", "job": job, "port": lane["port"]})
        fps = 1 if busy else 4
        if self.cam and fps != self.fps:
            self.fps = fps
            self.send({"op": "fps", "value": fps})

    def dev(self, job, lane):
        log = self.home / "preview" / f"{job}.log"
        log.parent.mkdir(exist_ok=True)
        env = {**os.environ, "PORT": str(lane["port"]), "HARNESS_LANE": job}
        nice = ["nice", "-n", "10"] if shutil.which("nice") else []
        with log.open("a") as out:
            proc = subprocess.Popen([*nice, "./init.sh"], cwd=lane["wt"], env=env, stdout=out, stderr=subprocess.STDOUT,
                                    stdin=subprocess.DEVNULL, start_new_session=True)
        self.follow_file(job, log, request, "request")  # the requests the app answers, while it runs for the office
        return proc

    # the camera ----------------------------------------------------------------------
    def modules(self):
        """A folder whose node_modules has Playwright: the project, else a lane's worktree."""
        for d in [self.root, *(lane["wt"] for lane in list(self.lanes.values()))]:
            if (d / "node_modules/@playwright/test").is_dir():
                return d
        return None

    def account(self):
        f = self.home / "office-viewer.json"  # a user in the local test database only; never in the repo
        if not f.exists():  # a new address with each new password: a lost file never locks the office out
            f.write_text(json.dumps({"email": f"office-viewer-{secrets.token_hex(3)}@example.test",
                                     "password": secrets.token_urlsafe(18)}))
            f.chmod(0o600)
        return json.loads(f.read_text())

    def camera(self):
        if self.cam and self.cam.poll() is None:
            return True
        mods = self.modules()
        if not mods:
            return False
        log = self.home / "preview" / "cam.log"
        log.parent.mkdir(exist_ok=True)
        with log.open("a") as err:
            self.cam = subprocess.Popen(["node", str(Path(__file__).resolve().parent / "cam.mjs"), str(mods), str(self.root)],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=err, text=True,
                                        start_new_session=True)
        threading.Thread(target=self.read, args=(self.cam,), daemon=True).start()
        if not (self.follower and self.follower.is_alive()):
            self.follower = threading.Thread(target=self.follow, daemon=True)
            self.follower.start()
        self.fps = 0
        self.send({"op": "login", **self.account()})
        for job, (_, endpoint) in list(self.qa.items()):
            self.send({"op": "qa", "job": job, "endpoint": endpoint})
        with self.lock:
            watched = [k for k, n in self.watching.items() if n > 0]
        for job, view in watched:
            self.send({"op": "watch", "job": job, "view": view, "on": True})
        return True

    def send(self, msg):
        cam = self.cam
        if not cam or cam.poll() is not None:
            return
        try:
            cam.stdin.write(json.dumps(msg) + "\n")
            cam.stdin.flush()
        except (OSError, ValueError):
            pass

    def read(self, cam):
        for line in cam.stdout:
            try:
                m = json.loads(line)
            except ValueError:
                continue
            if m.get("kind") == "frame" and m.get("job"):
                key = (m["job"], m.get("view") or "app")
                with self.lock:
                    seq = self.frames.get(key, (0,))[0] + 1
                    self.frames[key] = (seq, m.get("data", ""), m.get("url", ""))
                    self.lock.notify_all()
            elif m.get("kind") == "still" and m.get("job"):
                with contextlib.suppress(OSError, ValueError):
                    self.still(m["job"], m.get("data", ""), m.get("url", ""), m.get("path", ""), m.get("view") or "app")
            elif m.get("kind") == "status":
                stream.BUS.publish({"job": m.get("job") or "loop", "role": "main", "kind": "preview",
                                    "text": str(m.get("text", ""))[:300]})

    def follow(self):
        """File edits on the bus: the camera opens the page of the file being edited."""
        last = stream.BUS.snapshot(per_job=0)["last"]
        while True:
            for e in stream.BUS.since(last, timeout=15):
                last = e["id"]
                if e.get("kind") != "file_edit":
                    continue
                with self.lock:
                    lane = self.lanes.get(e["job"])
                if lane and lane["opened"]:
                    path = Path(e.get("path", ""))
                    with contextlib.suppress(ValueError):
                        path = path.relative_to(lane["wt"])
                    self.send({"op": "edited", "job": e["job"], "path": str(path)})

    def shutdown(self):
        """Every lane's dev server and QA Chrome, gone: the loop ends with sessions it never saw out (a stop, a crash).
        Seen for real: each such end left a headless Chrome (qa/<job> profile) running for good."""
        with self.lock:
            lanes, self.lanes = list(self.lanes.values()), {}
        qa, self.qa = list(self.qa.values()), {}
        for proc in [lane["dev"] for lane in lanes] + [q[0] for q in qa]:
            if proc:
                with contextlib.suppress(OSError):
                    os.killpg(proc.pid, 15)
        self.stop()

    def stop(self):
        cam, self.cam = self.cam, None
        if cam:
            with contextlib.suppress(OSError):
                os.killpg(cam.pid, 15)
        with self.lock:
            for lane in self.lanes.values():
                lane["opened"] = False


def free_port():
    with contextlib.closing(socket.socket()) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


PREVIEW = Preview()
