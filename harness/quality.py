#!/usr/bin/env python3
"""A check's numbers, for the office (DESIGN.md 14.14): coverage, tests and their time, and the bundle when there is a
build. scripts/check.sh runs it last. It writes only when the loop set HARNESS_QUALITY (a file in the loop's home,
outside the repo), so a check run by hand or in CI is unchanged. It never fails the check.

  coverage    coverage/coverage-summary.json (vitest's json-summary reporter, which the preset adds in the loop)
  tests       the kit reporters' $HARNESS_TESTS lines: passed and failed, unit and e2e, and how long they took
  bundle_kb   .next/static after a `next build` (.next/BUILD_ID), else left out
"""
import datetime
import json
import os
from pathlib import Path


def coverage(root):
    f = Path(root) / "coverage" / "coverage-summary.json"
    try:
        total = json.loads(f.read_text())["total"]
        return {k: total[k]["pct"] for k in ("lines", "statements", "functions", "branches") if k in total}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def tests(path):
    out = {}
    try:
        lines = Path(path).read_text().splitlines()
    except (OSError, TypeError):
        return None
    for line in lines:
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if not isinstance(d, dict) or d.get("event") != "end":
            continue
        r = out.setdefault(d.get("runner") or "unit", {"pass": 0, "fail": 0, "skip": 0, "ms": 0})
        r[d.get("status") if d.get("status") in ("pass", "fail") else "skip"] += 1
        r["ms"] += int(d.get("ms") or 0)
    return out or None


def bundle(root):
    static = Path(root) / ".next" / "static"
    if not (Path(root) / ".next" / "BUILD_ID").exists() or not static.is_dir():
        return None
    return round(sum(f.stat().st_size for f in static.rglob("*") if f.is_file()) / 1024)


def main(root="."):
    out = os.environ.get("HARNESS_QUALITY")
    if not out:
        return None
    q = {"at": datetime.datetime.now().isoformat(timespec="seconds"), "coverage": coverage(root),
         "tests": tests(os.environ.get("HARNESS_TESTS")), "bundle_kb": bundle(root)}
    q = {k: v for k, v in q.items() if v is not None}
    try:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(json.dumps(q))
    except OSError:
        pass
    return q


if __name__ == "__main__":
    main()
