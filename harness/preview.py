"""The lane's app, live, for the office's Focus view (DESIGN.md 14.12). Only while someone has the office open:
the lane's dev server (its ./init.sh on the lane's PORT, for a building or fixing session) and one headless Chrome
(cam.mjs) that signs in as the office's own test user, opens the page of the file the agent is editing and
screencasts it while someone watches that lane. The loop comes first: nothing new starts while the machine is busy,
and frames slow down. A dev server stops with its session (the loop stops what a session leaves in its worktree)."""
import collections
import contextlib
import http.client
import json
import os
import secrets
import shutil
import subprocess
import threading
import time
from pathlib import Path

import stream

IDLE = 180  # seconds with nobody watching before Chrome closes
LANE_STAGES = ("building", "fixing")


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
        self.frames = {}  # job -> (seq, jpeg as base64, url)
        self.cam, self.fps, self.follower = None, 0, None

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
    def watch(self, job):
        with self.lock:
            self.watching[job] += 1
            first = self.watching[job] == 1
        if first:
            self.send({"op": "watch", "job": job, "on": True})
        try:
            yield
        finally:
            with self.lock:
                self.watching[job] -= 1
                last = self.watching[job] <= 0
            if last:
                self.send({"op": "watch", "job": job, "on": False})

    def frame_after(self, job, seq, timeout=15):
        with self.lock:
            self.lock.wait_for(lambda: self.frames.get(job, (0,))[0] > seq, timeout)
            return self.frames.get(job)

    # sessions ------------------------------------------------------------------------
    def session_start(self, job, port, wt, stage):
        if self.enabled and stage in LANE_STAGES:
            with self.lock:
                self.lanes[job] = {"port": port, "wt": Path(wt), "stage": stage, "dev": None, "opened": False}

    def session_end(self, job):
        with self.lock:
            lane = self.lanes.pop(job, None)
        if lane and lane["dev"]:
            with contextlib.suppress(OSError):
                os.killpg(lane["dev"].pid, 15)
        if lane and lane["opened"]:
            self.send({"op": "close", "job": job})

    def tick(self, busy):
        """From the loop's tick: start what the people watching need, unless the machine is busy."""
        if not self.enabled:
            return
        with self.lock:
            viewers, seen, lanes = self.viewers, self.seen, dict(self.lanes)
        if not viewers:
            if self.cam and time.time() - seen > IDLE:
                self.stop()
            return
        for job, lane in lanes.items():
            if not serving(lane["port"]):
                if not busy and not lane["dev"] and (lane["wt"] / "init.sh").exists():
                    lane["dev"] = self.dev(job, lane)
                continue
            if not lane["opened"] and (self.cam or not busy) and self.camera():
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
            return subprocess.Popen([*nice, "./init.sh"], cwd=lane["wt"], env=env, stdout=out, stderr=subprocess.STDOUT,
                                    stdin=subprocess.DEVNULL, start_new_session=True)

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
        with self.lock:
            watched = [j for j, n in self.watching.items() if n > 0]
        for job in watched:
            self.send({"op": "watch", "job": job, "on": True})
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
                with self.lock:
                    seq = self.frames.get(m["job"], (0,))[0] + 1
                    self.frames[m["job"]] = (seq, m.get("data", ""), m.get("url", ""))
                    self.lock.notify_all()
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

    def stop(self):
        cam, self.cam = self.cam, None
        if cam:
            with contextlib.suppress(OSError):
                os.killpg(cam.pid, 15)
        with self.lock:
            for lane in self.lanes.values():
                lane["opened"] = False


PREVIEW = Preview()
