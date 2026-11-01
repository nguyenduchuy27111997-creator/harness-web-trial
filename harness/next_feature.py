#!/usr/bin/env python3
"""Query the backlog (harness/features.json + harness/status/, see backlog.py).

  next_feature.py [--milestone M1] [--retries N]           JSON of next feature to work on (nothing if none)
  next_feature.py [--milestone M1] [--retries N] --id      its id only
  next_feature.py [--milestone M1] [--retries N] --ids K   ids of the next K ready features, one per line
  next_feature.py [--milestone M1] [--retries N] --count   number of features ready to work on
  next_feature.py [--milestone M1] --waiting               failing features waiting on unfinished depends_on
  next_feature.py --status F012                            status of one feature
  next_feature.py --get F012 complexity                    one field of one feature (empty if unset)

A feature is ready when every id in its `depends_on` is `passing`. Work order:
`failing` before retries, `type: bug` before other types, then priority. With
--retries N, features that are `blocked` with `blocked_reason: failed` are retried
until they have failed N + 1 times (`attempts` counts failed sessions).
Features blocked as `needs_human` (or with no reason) are never retried.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backlog  # noqa: E402

p = argparse.ArgumentParser()
p.add_argument("--milestone")
p.add_argument("--retries", type=int, default=0)
g = p.add_mutually_exclusive_group()
g.add_argument("--count", action="store_true")
g.add_argument("--id", action="store_true")
g.add_argument("--ids", type=int, metavar="K")
g.add_argument("--waiting", action="store_true")
g.add_argument("--status", metavar="FEATURE_ID")
g.add_argument("--get", nargs=2, metavar=("FEATURE_ID", "KEY"))
args = p.parse_args()

features = backlog.read(Path(__file__).resolve().parent.parent)
status_of = {f["id"]: f["status"] for f in features}

if args.status:
    print(next((f["status"] for f in features if f["id"] == args.status), "missing"))
    raise SystemExit
if args.get:
    fid, key = args.get
    print(next((f.get(key, "") for f in features if f["id"] == fid), ""))
    raise SystemExit


def ready(f):
    return all(status_of.get(dep) == "passing" for dep in f.get("depends_on", []))


def in_scope(f):
    return not args.milestone or f.get("milestone") == args.milestone


if args.waiting:
    print(sum(1 for f in features if f["status"] == "failing" and in_scope(f) and not ready(f)))
    raise SystemExit


def retryable(f):
    return (f["status"] == "blocked" and f.get("blocked_reason") == "failed"
            and f.get("attempts", 0) <= args.retries)


todo = sorted(
    (f for f in features
     if (f["status"] == "failing" or retryable(f)) and in_scope(f) and ready(f)),
    key=lambda f: (f["status"] != "failing", f.get("type") != "bug", f["priority"]),
)
if args.count:
    print(len(todo))
elif args.ids:
    # Ready features never depend on each other (every dependency is already
    # passing), so the loop can build these in parallel.
    for f in todo[:args.ids]:
        print(f["id"])
elif todo:
    print(todo[0]["id"] if args.id else json.dumps(todo[0], indent=2, ensure_ascii=False))
