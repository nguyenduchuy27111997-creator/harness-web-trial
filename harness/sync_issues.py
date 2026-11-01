#!/usr/bin/env python3
"""Mirror harness/features.json into GitHub Issues, one way. Uses the `gh` CLI.

  sync_issues.py [--dry-run] [--ref REF]

--ref reads the backlog as committed on REF, so issues follow what is merged,
not a feature branch still waiting for review.

features.json stays the source of truth: each feature gets one issue titled
`[<id>] <title>`, labeled `harness`, `status:*`, `milestone:*`, `type:*`, closed
while the feature is `passing` and open otherwise. Edits made on GitHub to those
issues are overwritten. Open issues labeled `bug` that are not mirrored are listed
so a human can bring them in with /bug. Set GH_BIN to use another gh binary.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backlog  # noqa: E402

GH = os.environ.get("GH_BIN", "gh")
MANAGED = re.compile(r"^(harness|status:.*|milestone:.*|type:.*)$")
MARKER = "<!-- managed by harness/sync_issues.py from harness/features.json; edits here are overwritten -->"

p = argparse.ArgumentParser()
p.add_argument("--dry-run", action="store_true")
p.add_argument("--ref", help="read harness/features.json from this git ref instead of the working tree")
args = p.parse_args()


def gh(*cmd, write=False):
    if write and args.dry_run:
        print("would run: gh " + " ".join(cmd))
        return ""
    r = subprocess.run([GH, *cmd], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"gh {' '.join(cmd[:2])} failed: {r.stderr.strip()}")
    return r.stdout


def labels_for(f):
    return {"harness", f"status:{f['status']}", f"milestone:{f['milestone']}", f"type:{f.get('type', 'feature')}"}


def body_for(f):
    done = "x" if f["status"] == "passing" else " "
    head = [f"**Milestone** {f['milestone']} · **Status** {f['status']} · **Type** {f.get('type', 'feature')}"
            + (f" · **Complexity** {f['complexity']}" if f.get("complexity") else "")]
    if f.get("depends_on"):
        head.append(f"**Depends on** {', '.join(f['depends_on'])}")
    if f.get("blocked_reason"):
        head.append(f"**Blocked** {f['blocked_reason']} (attempts: {f.get('attempts', 0)})")
    lines = [MARKER, "", *head, "", "### Acceptance", "", *[f"- [{done}] {step}" for step in f["acceptance"]]]
    if f.get("notes"):
        lines += ["", "### Notes", "", f["notes"]]
    return "\n".join(lines) + "\n"


if args.ref and subprocess.run(["git", "cat-file", "-e", f"{args.ref}:harness/features.json"],
                               capture_output=True).returncode != 0:
    sys.exit(f"sync_issues: cannot read harness/features.json at {args.ref}")
features = backlog.read(".", args.ref or "")
issues = json.loads(gh("issue", "list", "--label", "harness", "--state", "all", "--limit", "1000",
                       "--json", "number,title,state,body,labels"))
by_id = {}
for issue in issues:
    m = re.match(r"^\[([^\]]+)\] ", issue["title"])
    if m:
        by_id[m.group(1)] = issue

wanted = set().union(*(labels_for(f) for f in features)) if features else set()
existing = {lbl["name"] for lbl in json.loads(gh("label", "list", "--limit", "1000", "--json", "name"))}
for name in sorted(wanted - existing):
    gh("label", "create", name, "--force", write=True)

created = updated = 0
for f in features:
    title, body, labels = f"[{f['id']}] {f['title']}", body_for(f), labels_for(f)
    issue = by_id.get(f["id"])
    if issue is None:
        cmd = ["issue", "create", "--title", title, "--body", body]
        for name in sorted(labels):
            cmd += ["--label", name]
        url = gh(*cmd, write=True).strip()
        created += 1
        if f["status"] == "passing" and url:
            gh("issue", "close", url.rsplit("/", 1)[-1], write=True)
        continue
    number = str(issue["number"])
    have = {lbl["name"] for lbl in issue["labels"] if MANAGED.match(lbl["name"])}
    edit = []
    if issue["title"] != title:
        edit += ["--title", title]
    if issue["body"].strip() != body.strip():
        edit += ["--body", body]
    for name in sorted(labels - have):
        edit += ["--add-label", name]
    for name in sorted(have - labels):
        edit += ["--remove-label", name]
    if edit:
        gh("issue", "edit", number, *edit, write=True)
    want_state = "CLOSED" if f["status"] == "passing" else "OPEN"
    if issue["state"] != want_state:
        gh("issue", "close" if want_state == "CLOSED" else "reopen", number, write=True)
    if edit or issue["state"] != want_state:
        updated += 1

orphans = sorted(set(by_id) - {f["id"] for f in features})
bugs = json.loads(gh("issue", "list", "--label", "bug", "--state", "open", "--limit", "1000",
                     "--json", "number,title,labels"))
untracked = [b for b in bugs if "harness" not in {lbl["name"] for lbl in b["labels"]}]

print(f"sync_issues: {created} created, {updated} updated, {len(features) - created - updated} unchanged")
for fid in orphans:
    print(f"sync_issues: issue #{by_id[fid]['number']} [{fid}] has no feature in features.json (left as is)")
for b in untracked:
    print(f"sync_issues: bug #{b['number']} is not in the backlog; run /bug to add it: {b['title']}")
