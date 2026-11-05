#!/usr/bin/env python3
"""GitHub for the office (DESIGN.md 14.14): a lane's CI run step by step, the failed steps' log, and its PR (body,
files, comments, commits). Read only. The dashboard asks only while someone looks at that lane, and each answer is
cached (20 s for CI, 60 s for a PR), so a lane nobody watches costs no API call. gh(*args) returns a CompletedProcess,
like runner.problem's, so tests stand in for the GitHub CLI."""
import json
import time

import ci_log
from stream import mask_whole

CI_TTL, PR_TTL = 20, 60
_cache = {}


def _cached(key, ttl, make):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < ttl:
        return hit[1]
    value = make()
    if len(_cache) > 200:
        _cache.clear()
    _cache[key] = (time.monotonic(), value)
    return value


def _json(out, default):
    try:
        return json.loads(out.stdout or "") if out.returncode == 0 else default
    except ValueError:
        return default


def ci(gh, branch, log=False):
    """The newest run on the branch and its jobs with their steps; with log, the failed steps' last lines."""
    def make():
        runs = _json(gh("run", "list", "--branch", branch, "--json", "databaseId,status,conclusion,headSha,url,createdAt,name",
                        "--limit", "1"), [])
        if not runs:
            return {"run": None, "jobs": []}
        run = runs[0]
        view = _json(gh("run", "view", str(run["databaseId"]), "--json", "jobs"), {})
        jobs = [{"name": j.get("name"), "status": j.get("status"), "conclusion": j.get("conclusion"),
                 "started": j.get("startedAt"), "completed": j.get("completedAt"),
                 "steps": [{"n": s.get("number"), "name": s.get("name"), "status": s.get("status"), "conclusion": s.get("conclusion")}
                           for s in j.get("steps") or []]} for j in view.get("jobs") or []]
        out = {"run": {"id": run["databaseId"], "status": run.get("status"), "conclusion": run.get("conclusion"),
                       "sha": (run.get("headSha") or "")[:12], "url": run.get("url"), "name": run.get("name"), "at": run.get("createdAt")},
               "jobs": jobs}
        if log and run.get("conclusion") == "failure":
            text = gh("run", "view", str(run["databaseId"]), "--log-failed").stdout or ""
            out["log"] = mask_whole(ci_log.trim(text)) if text.strip() else ""
        return out
    return _cached(("ci", branch, log), CI_TTL, make)


def pr(gh, number):
    """The PR as the office shows it: what it says, what it changes, who said what, its commits."""
    def make():
        d = _json(gh("pr", "view", str(number), "--json",
                     "number,title,body,url,state,additions,deletions,files,comments,commits,reviewDecision"), None)
        if not d:
            return None
        return {"number": d.get("number"), "title": d.get("title"), "url": d.get("url"), "state": d.get("state"),
                "body": mask_whole(d.get("body") or "")[:6000], "additions": d.get("additions"), "deletions": d.get("deletions"),
                "review": d.get("reviewDecision"),
                "files": [{"path": f.get("path"), "add": f.get("additions"), "del": f.get("deletions")} for f in d.get("files") or []][:200],
                "comments": [{"by": (c.get("author") or {}).get("login"), "at": c.get("createdAt"), "body": mask_whole(c.get("body") or "")[:2000]}
                             for c in d.get("comments") or []][-30:],
                "commits": [{"sha": (c.get("oid") or "")[:9], "title": c.get("messageHeadline"), "at": c.get("committedDate"),
                             "by": ((c.get("authors") or [{}])[0] or {}).get("name")} for c in d.get("commits") or []][-50:]}
    return _cached(("pr", number), PR_TTL, make)
