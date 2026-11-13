#!/usr/bin/env python3
"""Push notifications to the owner's phone through ntfy (https://ntfy.sh, free app for iOS and Android).

The config lives beside the loop's state, never in the repo: <git common dir>/harness-loop/notify.json,
{"url": "https://ntfy.sh", "topic": "<24 random characters>", "detail": false}. The topic is the only
secret: anyone who knows it can read the pushes, so by default a push holds only an id, a title and one
line (detail: true sends the full question). Sending never blocks or fails the loop.
"""
import json
import secrets
import string
import subprocess
import sys
import threading
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://ntfy.sh"


def config(home):
    f = Path(home) / "notify.json"
    try:
        cfg = json.loads(f.read_text())
    except (OSError, ValueError):
        return None
    return cfg if cfg.get("topic") else None


def setup(home, url=DEFAULT_URL, detail=False):
    topic = "harness-" + "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(24))
    cfg = {"url": url.rstrip("/"), "topic": topic, "detail": detail}
    (Path(home) / "notify.json").write_text(json.dumps(cfg, indent=2) + "\n")
    return cfg


def post(cfg, title, message, priority=3, tags=(), click=None, actions=None):
    """Publish as JSON to the server's root (no header encoding limits). True when the server took it."""
    body = {"topic": cfg["topic"], "title": title[:200], "message": message[:3500], "priority": priority,
            "tags": list(tags)}
    if click:
        body["click"] = click
    if actions:  # buttons on the push (ntfy "http" actions), e.g. the monitor's "Got it"
        body["actions"] = actions
    req = urllib.request.Request(cfg["url"] + "/", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return 200 <= r.status < 300
    except Exception:
        return False


DESKTOP = False  # macOS notifications: `loop.py start` turns them on (LOOP_DESKTOP=0 keeps them off); tests never do


def desktop(title, message):
    """A macOS notification (Notification Center), with or without ntfy. Never blocks or fails the loop.
    AppleScript strings take JSON's quoting: \\" and \\\\ escape the same way."""
    if not DESKTOP or sys.platform != "darwin":
        return False
    q = lambda s: json.dumps(s, ensure_ascii=False)  # noqa: E731
    try:
        subprocess.Popen(["osascript", "-e", f"display notification {q(message[:240])} with title {q(title[:80])}"],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except OSError:
        return False


def send(home, title, message, priority=3, tags=(), click=None, wait=False, actions=None):
    """Send in the background (wait=True for the last push before the process exits). No config: nothing."""
    cfg = config(home)
    if not cfg:
        return False
    if wait:
        return post(cfg, title, message, priority, tags, click, actions)
    threading.Thread(target=post, args=(cfg, title, message, priority, tags, click, actions), daemon=True).start()
    return True
