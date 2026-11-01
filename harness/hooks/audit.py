#!/usr/bin/env python3
"""PostToolUse hook: one line per tool call of a loop session (HARNESS_AUTONOMOUS=1), for an audit trail of
what each session did: <git common dir>/harness-loop/audit/<lane>.jsonl. Secrets are masked. Never fails the
session: every error is swallowed and it always exits 0."""
import datetime
import json
import os
import re
import subprocess
import sys

SECRET = re.compile(r"(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}"
                    r"|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{10,})"
                    r"|((?:password|passwd|secret|token|api[_-]?key|authorization)[\"']?\s*[:=]\s*[\"']?)[^\s\"',]+", re.I)


def mask(text):
    return SECRET.sub(lambda m: (m.group(2) or "") + "***", str(text))[:2000]


def main():
    if os.environ.get("HARNESS_AUTONOMOUS") != "1":
        return
    event = json.load(sys.stdin)
    tool, given = event.get("tool_name", "?"), event.get("tool_input") or {}
    what = given.get("command") or given.get("file_path") or given.get("url") or given.get("pattern") or given
    home = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], capture_output=True,
                          text=True, cwd=event.get("cwd") or None).stdout.strip()
    folder = os.path.join(home, "harness-loop", "audit")
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, f"{os.environ.get('HARNESS_LANE', 'session')}.jsonl"), "a") as f:
        f.write(json.dumps({"at": datetime.datetime.now().isoformat(timespec="seconds"), "session": event.get("session_id"),
                            "stage": os.environ.get("HARNESS_STAGE"), "tool": tool, "input": mask(what)}) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
