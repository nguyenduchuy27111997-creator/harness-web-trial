#!/usr/bin/env python3
"""Validate the backlog. Run by scripts/check.sh; exit 1 lists every problem.

Definitions (harness/features.json) need: id, milestone, priority (int), title,
acceptance (list); optional: type, complexity, depends_on, owner_check (bool: the owner checks
it against what they meant once it merges). Each feature's state
(harness/status/<id>.json, see backlog.py) has status, notes, and optionally
blocked_reason and attempts; no file means failing.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backlog  # noqa: E402

REQUIRED = {"id": str, "milestone": str, "priority": int, "title": str, "acceptance": list, "status": str,
            "notes": str}
ENUMS = {"status": {"failing", "passing", "blocked"}, "type": {"feature", "bug", "chore"},
         "complexity": {"S", "M", "L"}, "blocked_reason": {"failed", "needs_human"}}


def milestone_rank(m):
    found = re.fullmatch(r"M(\d+)", m)
    return int(found.group(1)) if found else None


def problems(features):
    out = []
    ids = [f.get("id") for f in features]
    by_id = {f.get("id"): f for f in features}
    for fid in {i for i in ids if ids.count(i) > 1}:
        out.append(f"duplicate id {fid}")
    priorities = [f.get("priority") for f in features]
    for pr in {p for p in priorities if priorities.count(p) > 1}:
        out.append(f"duplicate priority {pr}")

    for f in features:
        fid = f.get("id", "?")
        for key, kind in REQUIRED.items():
            if not isinstance(f.get(key), kind) or isinstance(f.get(key), bool):
                out.append(f"{fid}: `{key}` must be a {kind.__name__}")
        for key, allowed in ENUMS.items():
            if key in f and f[key] not in allowed:
                out.append(f"{fid}: `{key}` is {f[key]!r}, expected one of {sorted(allowed)}")
        if "owner_check" in f and not isinstance(f["owner_check"], bool):
            out.append(f"{fid}: `owner_check` must be true or false")
        if "attempts" in f and (not isinstance(f["attempts"], int) or f["attempts"] < 0):
            out.append(f"{fid}: `attempts` must be a non-negative int")
        deps = f.get("depends_on", [])
        if not isinstance(deps, list):
            out.append(f"{fid}: `depends_on` must be a list of ids")
            continue
        for dep in deps:
            if dep == fid:
                out.append(f"{fid}: depends on itself")
            elif dep not in by_id:
                out.append(f"{fid}: depends on unknown {dep}")
            else:
                mine, theirs = milestone_rank(f.get("milestone", "")), milestone_rank(by_id[dep].get("milestone", ""))
                if mine is not None and theirs is not None and theirs > mine:
                    out.append(f"{fid}: depends on {dep} from a later milestone")

    # Cycles: depth-first search over depends_on.
    state = {}

    def visit(fid, path):
        if state.get(fid) == "done" or fid not in by_id:
            return
        if state.get(fid) == "open":
            out.append("dependency cycle: " + " -> ".join(path[path.index(fid):] + [fid]))
            return
        state[fid] = "open"
        deps = by_id[fid].get("depends_on", [])
        for dep in deps if isinstance(deps, list) else []:
            if dep != fid:
                visit(dep, path + [fid])
        state[fid] = "done"

    for fid in by_id:
        visit(fid, [])
    return out


def status_problems(root, ids):
    out = []
    for fid, fields in backlog.statuses(root).items():
        where = f"{backlog.STATUS_DIR}/{fid}.json"
        if fid not in ids:
            out.append(f"{where}: no feature {fid} in features.json")
        extra = sorted(set(fields) - set(backlog.STATUS_FIELDS))
        if extra:
            out.append(f"{where}: unknown field(s) {', '.join(extra)} (allowed: {', '.join(backlog.STATUS_FIELDS)})")
    return out


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "harness/features.json")
    root = path.resolve().parent.parent
    try:
        json.loads(path.read_text())["features"]
        features = backlog.read(root)
        found = problems(features) + status_problems(root, {f.get("id") for f in features})
    except (ValueError, KeyError, TypeError) as e:
        print(f"{path}: not a valid backlog ({e})")
        return 1
    for line in found:
        print(f"{path}: {line}")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
