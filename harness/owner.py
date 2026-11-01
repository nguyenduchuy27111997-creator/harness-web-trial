#!/usr/bin/env python3
"""What the loop says to its owner and reads back, kept apart from the loop's own logic (pure functions).

- command(): a GitHub comment that starts with /answer, /drop, /bug or /ok.
- digest(): a few lines on the last days of runs, for `loop.py digest` and the push at the end of a run.
"""
import datetime
import re

COMMAND = re.compile(r"^\s*/(answer|drop|bug|ok)\b[ \t]*(.*)", re.I | re.S)


def command(body):
    """("answer", "text") for "/answer text" (the rest of the comment is part of the text), else None."""
    m = COMMAND.match(body or "")
    return (m.group(1).lower(), m.group(2).strip()) if m else None


def digest(history, state, feedback, days=7, today=None):
    """At most six lines: this run, the last days, what waits on the owner, samples, feedback, repeats."""
    today = today or datetime.datetime.now()
    since = (today - datetime.timedelta(days=days)).isoformat(timespec="seconds")
    runs = [r for r in history if r.get("ended", "") >= since]
    merged = [m["id"] for r in runs for m in r.get("merged", [])]
    lines = []
    if runs:
        last = runs[-1]
        lines.append(f"This run: {len(last.get('merged', []))} merged, ${last.get('spent', 0):.2f}; "
                     f"stopped: {last.get('stop_reason') or 'still running'}.")
    lines.append(f"Last {days} days: {len(merged)} merged" + (f" ({', '.join(merged[:8])}{', …' if len(merged) > 8 else ''})"
                                                               if merged else "")
                 + f", ${sum(r.get('spent', 0) for r in runs):.2f} over {len(runs)} run{'s' if len(runs) != 1 else ''}.")
    waiting = [f"{j['id']} ({j['stage']})" for j in state.get("jobs", {}).values() if j.get("question")]
    if waiting:
        lines.append("Waiting on you: " + ", ".join(waiting[:8]) + ".")
    samples = [f"{fid} (#{s['pr']})" for fid, s in state.get("samples", {}).items() if s.get("status") == "pending"]
    if samples:
        lines.append("Check against what you meant (/ok or /bug on the PR): " + ", ".join(samples[:6]) + ".")
    open_feedback = [f for f in feedback if not f.get("handled")]
    if open_feedback:
        lines.append(f"Feedback to sort out in chat (/feedback): {len(open_feedback)}.")
    repeated = sorted(state.get("repeated", {}).items(), key=lambda kv: -kv[1])[:3]
    if repeated:
        lines.append("Repeated failures: " + ", ".join(f"{k} x{n}" for k, n in repeated) + ".")
    return lines[:6]
