#!/usr/bin/env python3
"""The self-hosted CI runner on this machine: does it take jobs, and restart its service when it does not.

Seen for real: after the network dropped, the runner's listener stayed up but took no job, and CI queued for
hours until someone ran `svc.sh stop` and `svc.sh start`. With the owner's consent (`loop.py runner on`) the
loop restarts the runner's launchd service; LAUNCHCTL_BIN and LOOP_LAUNCH_AGENTS stand in for tests.
"""
import datetime
import glob
import json
import os
import subprocess
from pathlib import Path

LAUNCHCTL = os.environ.get("LAUNCHCTL_BIN", "launchctl")
AGENTS = os.environ.get("LOOP_LAUNCH_AGENTS", os.path.expanduser("~/Library/LaunchAgents"))
QUEUED_MAX = 600  # seconds a run may wait for an idle runner before the runner counts as stuck


def problem(gh, repo, now=None):
    """None when CI can run (or nothing is known), else why it cannot. gh(*args) returns a CompletedProcess."""
    out = gh("api", f"repos/{repo}/actions/runners", "--jq", ".runners")
    try:
        runners = json.loads(out.stdout or "[]") if out.returncode == 0 else []
    except ValueError:
        return None
    if not runners:
        return None  # none registered, or no admin rights to see them: nothing to judge
    online = [r for r in runners if r.get("status") == "online"]
    if not online:
        return "every self-hosted runner is offline"
    idle = [r for r in online if not r.get("busy")]
    if not idle:
        return None
    q = gh("run", "list", "--status", "queued", "--json", "createdAt,databaseId", "--limit", "20")
    try:
        runs = json.loads(q.stdout or "[]") if q.returncode == 0 else []
    except ValueError:
        return None
    now = now or datetime.datetime.now(datetime.timezone.utc)
    ages = [(now - datetime.datetime.fromisoformat(r["createdAt"].replace("Z", "+00:00"))).total_seconds()
            for r in runs if r.get("createdAt")]
    if ages and max(ages) > QUEUED_MAX:
        return f"a run has waited {max(ages) / 60:.0f} min while runner {idle[0].get('name')} sits idle"
    return None


def services(repo):
    """The launchd plists `svc.sh install` made for this repo's runners."""
    owner, name = repo.split("/", 1)
    return sorted(glob.glob(os.path.join(AGENTS, f"actions.runner.{owner}-{name}.*.plist")))


def restart(plist, hard=False):
    """kickstart -k first; a second try unloads and loads the service again."""
    label, domain = Path(plist).stem, f"gui/{os.getuid()}"
    cmds = ([[LAUNCHCTL, "bootout", f"{domain}/{label}"], [LAUNCHCTL, "bootstrap", domain, plist]] if hard
            else [[LAUNCHCTL, "kickstart", "-k", f"{domain}/{label}"]])
    for cmd in cmds:
        subprocess.run(cmd, capture_output=True, timeout=60)
