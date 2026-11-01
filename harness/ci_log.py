#!/usr/bin/env python3
"""Trims `gh run view <id> --log-failed` for a fix session's prompt: the session starts from the
failure instead of spending turns finding it. Each line is `job<TAB>step<TAB>timestamp message`."""
import re

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
STAMP = re.compile(r"^\d{4}-\d\d-\d\dT[\d:.]+Z ?")


def trim(text, per_step=120, total=8000):
    """The last per_step lines of each failed step, at most total characters (the end, where errors are)."""
    steps = {}
    for line in text.splitlines():
        parts = line.split("\t", 2)
        name, message = (f"{parts[0]} / {parts[1]}", parts[2]) if len(parts) == 3 else ("log", line)
        steps.setdefault(name, []).append(STAMP.sub("", ANSI.sub("", message)).rstrip())
    out = "\n\n".join(f"## {name}\n" + "\n".join(lines[-per_step:]) for name, lines in steps.items())
    return out[-total:]
