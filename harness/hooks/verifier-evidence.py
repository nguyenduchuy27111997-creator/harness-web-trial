#!/usr/bin/env python3
"""SubagentStop hook for the verifier and the architect (matchers in .claude/settings.json).

Writes the subagent's own final report to harness/evidence/, so the coding agent
never writes evidence itself:
  verifier   `FEATURE: <id>`    -> harness/evidence/<id>.md
  architect  `DESIGN: <M>`      -> harness/evidence/design-<M>.md, with the sha256
                                   of docs/design/<M>.md as the architect saw it
harness/integrity.py refuses a feature turning `passing`, or a changed design doc,
without a fresh PASS file here.

The report is the last text with `VERDICT:` and `FEATURE:` (or `DESIGN:`) lines: in
`last_assistant_message`, or else in the subagent's transcript, where a
background subagent hands its report back through a tool call (SubagentHandback).
Set HARNESS_HOOK_TRACE to a file path to log every call, for debugging.
"""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

REPORT = re.compile(r"^VERDICT:\s*(PASS|FAIL)\b.*^(FEATURE|DESIGN):\s*([A-Za-z0-9_-]+)\s*$", re.M | re.S)
KIND = {"verifier": "FEATURE", "architect": "DESIGN"}


def strings(value):
    """Every string inside a JSON value, depth first."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)


def report_from_transcript(path):
    """The last report-shaped string the subagent produced, from its own messages only."""
    found = None
    try:
        lines = Path(path).read_text().splitlines()
    except OSError:
        return None
    for line in lines:
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        message = entry.get("message") or {}
        if message.get("role") != "assistant":
            continue
        for text in strings(message.get("content")):
            if REPORT.search(text):
                found = text
    return found


d = json.load(sys.stdin)
if os.environ.get("HARNESS_HOOK_TRACE"):
    with open(os.environ["HARNESS_HOOK_TRACE"], "a") as f:
        f.write(json.dumps({k: d.get(k) for k in ("hook_event_name", "agent_type", "agent_id",
                                                   "agent_transcript_path")}) + "\n")
kind = KIND.get(d.get("agent_type"))
if not kind:
    sys.exit(0)
msg = (d.get("last_assistant_message") or "").strip()
# A real run lost a PASS: the hook read the transcript before the hand-back reached it. Read again for a while.
for _ in range(int(os.environ.get("HARNESS_HOOK_WAIT", "10")) * 2 if not REPORT.search(msg) else 0):
    if d.get("agent_transcript_path"):
        msg = (report_from_transcript(d["agent_transcript_path"]) or "").strip()
    if REPORT.search(msg):
        break
    time.sleep(0.5)
m = REPORT.search(msg)
if not m or m.group(2) != kind:
    sys.exit(0)
os.chdir(os.environ.get("CLAUDE_PROJECT_DIR", "."))
head = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
now = datetime.datetime.now().isoformat(timespec="seconds")
name, extra = m.group(3), ""
if kind == "DESIGN":
    doc = Path("docs/design") / f"{name}.md"
    sha = hashlib.sha256(doc.read_text().encode()).hexdigest() if doc.exists() else "(no design doc)"
    name, extra = f"design-{name}", f"- Design sha256: {sha}\n"
out = Path("harness/evidence") / f"{name}.md"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(
    "<!-- written by harness/hooks/verifier-evidence.py; do not edit -->\n"
    f"- Verified at: {now} on {head or '(no commit)'} plus working tree\n"
    f"- {d.get('agent_type').capitalize()} run: {d.get('agent_id', '?')}\n{extra}\n{msg}\n")
