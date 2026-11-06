#!/usr/bin/env python3
"""Integrity guard: catches an agent gaming the harness between two snapshots.

  integrity.py --base REF [--head REF]    head defaults to the git index (staged)

Fails (exit 1, one line per violation) when, from base to head:
  - harness/features.json loses a feature, gains one, or changes anything but
    `status`, `notes`, `blocked_reason` and `attempts`;
  - a harness/status/<id>.json appears for a feature that does not exist;
  - a feature becomes `passing` without a new harness/evidence/<id>.md that says
    `VERDICT: PASS` (written by the verifier hook, see harness/hooks/);
  - docs/design/<M>.md is added or changed without harness/evidence/design-<M>.md
    holding the architect's PASS for exactly that content (its sha256);
  - a test file is deleted, loses assertions, or gains a skip/only marker (only tests that are on
    origin/main count when that ref exists: a branch may rework tests it added itself and never merged);
  - with --rule (a rule PR the loop opened from a repeated failure, branch agent/rule-*):
    anything but docs/golden-principles.md and .claude/agents/reviewer.md changes, a line of
    theirs is removed or rewritten (renumbering is fine), or more than 15 lines are added;
  - with --agent, or in an autonomous session (HARNESS_AUTONOMOUS=1): a protected harness file
    (PROTECTED: the guard, the loop, hooks, CI, settings, agents, skills, the gate) changes. Only a
    human-led session changes those; a rule PR still edits its two files.

HARNESS_HUMAN_OVERRIDE=1 lifts the backlog and test checks for a human-led
change such as /kickoff. It is ignored in autonomous runs (HARNESS_AUTONOMOUS=1).
The evidence and protected-file checks are never lifted.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

FEATURES = "harness/features.json"
MAIN_REF = os.environ.get("HARNESS_MAIN_REF", "origin/main")
RULE_FILES = {"docs/golden-principles.md", ".claude/agents/reviewer.md"}
RULE_MAX_LINES = 15  # real rule PRs added 4 to 6 lines
# What an agent's branch may never change: the guard and the loop that run it, their hooks, CI, the
# settings, agents and skills that steer sessions, and the gate. CI runs this file from the base branch,
# so a branch cannot loosen the list for itself.
PROTECTED = re.compile(r"^(harness/[^/]+\.py|harness/hooks/|harness/loop-[^/]+\.json|\.githooks/|\.github/"
                       r"|\.claude/(settings[^/]*\.json|agents/|skills/)|scripts/(check|deploy|rollback)\.sh|\.npmrc)")
DESIGN = re.compile(r"^docs/design/([A-Za-z0-9_-]+)\.md$")
STATUS_DIR = "harness/status/"
EDITABLE = {"status", "notes", "blocked_reason", "attempts"}
TEST_FILE = re.compile(
    r"(^|/)(tests?|e2e|__tests__)/|\.(test|spec)\.[cm]?[jt]sx?$|(^|/)test_[^/]*\.py$|_test\.(py|go)$")
ASSERTION = re.compile(r"\bassert\w*|\bexpect\s*\(|\.should\b|\bt\.(is|ok|equal|deepEqual|true|false|throws)\b")
IMAGE = re.compile(r"\.(png|jpe?g|gif|webp)$")  # visual baselines: may change, may not be deleted
SKIP = re.compile(r"\.(skip|only)\s*\(|\bx(it|describe|test)\s*\(|@pytest\.mark\.skip|@unittest\.skip|\bt\.skip\b")


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True, errors="replace")  # baselines are images
    return r.stdout if r.returncode == 0 else None


def files(ref):
    out = git("ls-files") if ref == ":" else git("ls-tree", "-r", "--name-only", ref)
    return set((out or "").splitlines())


def show(ref, path):
    return git("show", f"{ref}{path}" if ref == ":" else f"{ref}:{path}")


def definitions(ref):
    text = show(ref, FEATURES)
    return {f["id"]: f for f in json.loads(text)["features"]} if text else {}


def statuses(ref):
    """harness/status/<id>.json at ref (see backlog.py; this file runs standalone)."""
    found = {}
    for path in files(ref):
        if path.startswith(STATUS_DIR) and path.endswith(".json"):
            found[path[len(STATUS_DIR):-len(".json")]] = json.loads(show(ref, path) or "{}")
    return found


def features(ref):
    """Definitions merged with status files, as backlog.read() does."""
    defs, state = definitions(ref), statuses(ref)
    return {fid: {"status": "failing", **f, **state.get(fid, {})} for fid, f in defs.items()}


def diff(base, head, *args, paths=()):
    refs = ["--cached", base] if head == ":" else [base, head]
    return git("diff", *args, *refs, "--", *paths)


def rule_lines(base, head):
    """A rule PR only adds rules: every removed line comes back with just its number changed."""
    removed, added = [], []
    for line in (diff(base, head, "-U0", paths=sorted(RULE_FILES)) or "").splitlines():
        if line.startswith(("+++", "---")):
            continue
        if line.startswith("-"):
            removed.append(line[1:])
        elif line.startswith("+") and line[1:].strip():
            added.append(line[1:])
    unnumbered = lambda text: re.sub(r"^\s*\d+\.\s*", "", text)
    problems = []
    for line in removed:
        match = next((a for a in added if unnumbered(a) == unnumbered(line)), None)
        if match is None:
            if line.strip():
                problems.append(f"a rule PR may only add rules; it removes or rewrites: {line.strip()[:100]}")
            continue
        added.remove(match)
    if len(added) > RULE_MAX_LINES:
        problems.append(f"a rule PR may add at most {RULE_MAX_LINES} lines; it adds {len(added)}")
    return problems


def check(base, head, override, rule=False, agent=False):
    problems = []
    changed = set((diff(base, head, "--name-only") or "").split())
    if rule:
        for path in sorted(changed - RULE_FILES):
            problems.append(f"{path}: a rule PR may change only {', '.join(sorted(RULE_FILES))}")
        problems += rule_lines(base, head)
    # Merging main in brings main's changes (a kit upgrade, a backlog edit made with the override): those are
    # not the agent's edits. Seen for real: F031's resolved conflict was refused for main's loop.py, and F042-F044's
    # for main's new touches; each feature built again.
    merging = head == ":" and git("rev-parse", "-q", "--verify", "MERGE_HEAD") is not None
    if agent:
        for path in sorted(p for p in changed if PROTECTED.match(p) and not (rule and p in RULE_FILES)
                           and not (merging and show(":", p) == show("MERGE_HEAD", p))):
            problems.append(f"{path}: a protected harness file; an agent may not change it (a human-led session can)")
    old, new = features(base), features(head)
    old_defs, new_defs = definitions(base), definitions(head)
    main_defs = definitions("MERGE_HEAD") if merging else {}
    for fid in sorted(set(statuses(head)) - set(new_defs)):
        problems.append(f"{STATUS_DIR}{fid}.json: status for a feature that does not exist")

    if not override:
        for fid in old.keys() - new.keys():
            if not (merging and fid not in main_defs):
                problems.append(f"{FEATURES}: feature {fid} was removed")
        if old:
            for fid in new.keys() - old.keys():
                if not (merging and fid in main_defs):
                    problems.append(f"{FEATURES}: feature {fid} was added")
        for fid in old_defs.keys() & new_defs.keys():
            changed = sorted(k for k in old_defs[fid].keys() | new_defs[fid].keys()
                             if k not in EDITABLE and old_defs[fid].get(k) != new_defs[fid].get(k)
                             and not (merging and fid in main_defs and new_defs[fid].get(k) == main_defs[fid].get(k)))
            if changed:
                problems.append(f"{FEATURES}: {fid} changed {', '.join(changed)} (only status, notes, blocked_reason, attempts may change)")

    for fid, f in new.items():
        if f.get("status") != "passing" or old.get(fid, {}).get("status") == "passing":
            continue
        path = f"harness/evidence/{fid}.md"
        evidence = show(head, path)
        if not evidence:
            problems.append(f"{fid} marked passing without {path} (the verifier writes it)")
        elif evidence == show(base, path):
            problems.append(f"{fid} marked passing but {path} is not from a new verifier run")
        elif not re.search(r"^VERDICT:\s*PASS\b", evidence, re.M) or not re.search(
                rf"^FEATURE:\s*{re.escape(fid)}\s*$", evidence, re.M):
            problems.append(f"{fid} marked passing but {path} is not a PASS for {fid}")

    head_files = files(head)
    for path in sorted(head_files):
        m = DESIGN.match(path)
        doc = show(head, path) if m else None
        if doc is None or doc == show(base, path):
            continue
        ms, proof = m.group(1), f"harness/evidence/design-{m.group(1)}.md"
        evidence = show(head, proof) or ""
        sha = hashlib.sha256(doc.encode()).hexdigest()
        if not (re.search(r"^VERDICT:\s*PASS\b", evidence, re.M) and re.search(rf"^DESIGN:\s*{re.escape(ms)}\s*$", evidence, re.M)
                and f"Design sha256: {sha}" in evidence):
            problems.append(f"{path} changed without an architect PASS for this content in {proof}")

    if not override:
        # Seen for real: a fix round dropped code it had added, with the tests it had added for it, and the
        # guard refused it. A test no one merged yet guards nothing on main, so only main's tests count.
        merged = files(MAIN_REF) if git("rev-parse", "--verify", "-q", MAIN_REF) is not None else None
        for path in sorted(p for p in files(base) if TEST_FILE.search(p) and (merged is None or p in merged)):
            if path not in head_files:
                problems.append(f"{path}: test file deleted")
                continue
            if IMAGE.search(path):
                continue
            before, after = show(base, path) or "", show(head, path) or ""
            if len(ASSERTION.findall(after)) < len(ASSERTION.findall(before)):
                problems.append(f"{path}: assertions removed")
            if len(SKIP.findall(after)) > len(SKIP.findall(before)):
                problems.append(f"{path}: skip/only marker added")
        for path in sorted(p for p in head_files - files(base) if TEST_FILE.search(p) and not IMAGE.search(p)):
            if SKIP.search(show(head, path) or ""):
                problems.append(f"{path}: new test file has a skip/only marker")
    return problems


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", required=True)
    p.add_argument("--head", default=":")
    p.add_argument("--rule", action="store_true", help="a rule PR: only the rule files may change")
    p.add_argument("--agent", action="store_true", help="an agent's branch: protected files may not change")
    a = p.parse_args()
    if git("rev-parse", "--verify", "-q", a.base) is None:
        return 0  # nothing to compare against yet, e.g. the first commit
    override = os.environ.get("HARNESS_HUMAN_OVERRIDE") == "1" and os.environ.get("HARNESS_AUTONOMOUS") != "1"
    agent = a.agent or os.environ.get("HARNESS_AUTONOMOUS") == "1"
    problems = check(a.base, a.head, override, a.rule, agent)
    for line in problems:
        print(f"integrity: {line}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
