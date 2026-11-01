#!/usr/bin/env python3
"""Migration safety for the migrations this branch adds (compared with origin/main).

Fails when a branch:
  - edits, renames or deletes a migration that is already on main;
  - adds a migration without a `-- rollback:` comment saying how to undo it;
  - adds a destructive or locking change (drop, truncate, delete, rename, change of
    column type, NOT NULL without a default) without `-- destructive-approved: <file>`
    naming an existing decision in docs/decisions/ that a human approved.
Data must survive every migration: expand first (add, backfill), contract later.
Run by scripts/check.sh.
"""
import re
import subprocess
import sys
from pathlib import Path

DIR = "supabase/migrations/"
DESTRUCTIVE = [
    (r"\bdrop\s+(table|column|schema|type|view|function)\b", "drops"),
    (r"\btruncate\b", "truncates"),
    (r"\bdelete\s+from\b", "deletes rows"),
    (r"\brename\s+(column\s+\w+\s+)?to\b", "renames"),
    (r"\balter\s+column\s+\"?\w+\"?\s+(set\s+data\s+)?type\b", "changes a column type"),
    (r"\balter\s+column\s+\"?\w+\"?\s+set\s+not\s+null\b", "sets NOT NULL on existing rows"),
    (r"\badd\s+column\s+(?:if\s+not\s+exists\s+)?\"?\w+\"?\s+[^,;]*\bnot\s+null\b(?![^,;]*\bdefault\b)", "adds NOT NULL without a default"),
]


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def main():
    base = git("merge-base", "origin/main", "HEAD") or git("rev-parse", "HEAD")
    if not base:
        return 0
    problems = []
    changed = (git("diff", "--name-status", "--no-renames", base, "--", DIR) or "").splitlines()
    new = set((git("ls-files", "--others", "--exclude-standard", DIR) or "").split())
    for line in changed:
        status, path = line.split("\t", 1)
        if status == "A":
            new.add(path)
        else:
            problems.append(f"{path}: a migration already on main was {'deleted' if status == 'D' else 'edited'}; add a new migration instead")
    for path in sorted(p for p in new if p.endswith(".sql")):
        text = Path(path).read_text()
        if not re.search(r"^\s*--\s*rollback:\s*\S", text, re.M | re.I):
            problems.append(f"{path}: no `-- rollback:` comment saying how to undo this migration")
        sql = re.sub(r"--[^\n]*", "", text).lower()
        approved = re.search(r"--\s*destructive-approved:\s*(\S+)", text, re.I)
        ok = approved and approved.group(1).startswith("docs/decisions/") and Path(approved.group(1)).is_file()
        for pattern, what in DESTRUCTIVE:
            if re.search(pattern, sql) and not ok:
                problems.append(f"{path}: {what}; data must survive (expand, backfill, contract later) or a human approves it "
                                "in docs/decisions/ (-- destructive-approved: docs/decisions/<file>.md)")
    for p in problems:
        print(f"migration: {p}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
