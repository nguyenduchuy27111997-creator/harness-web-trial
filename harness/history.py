#!/usr/bin/env python3
"""The office's long memory (DESIGN.md 14.13): what each day looked like, to replay it, the numbers over weeks, and
a short summary of each day.

Sources the loop already keeps in its home (<git common dir>/harness-loop):
  events.log        every stage change and loop event, one line each, forever
  streams/*.jsonl   each session's events as the office saw them (stream.py)
  state.json        every job, with its cost, sessions and merge time
  failures.jsonl    every failure, by kind
Kept: streams and films for LOOP_HISTORY_DAYS (30) and at most LOOP_HISTORY_MB (2000) together, the oldest going
first. events.log, state.json and the summaries are small and stay.
"""
import collections
import contextlib
import datetime
import json
import os
import re
import shutil
import statistics
import subprocess
from pathlib import Path

import lang

KEEP_DAYS = int(os.environ.get("LOOP_HISTORY_DAYS", "30"))
CAP = int(os.environ.get("LOOP_HISTORY_MB", "2000")) * 1_000_000
STAGES = {"queued", "building", "review", "fixing", "ci", "merging", "waiting_base", "needs_human", "held", "failed",
          "merged", "dropped"}
LINE = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\s+(\S+)\s+(.*)$")
DAY = re.compile(r"^\d{4}-\d\d-\d\d$")
SUMMARY_COST = 0.10  # the most a day's summary may cost


def size(p):
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.is_dir() else p.stat().st_size


def prune(home, now=None):
    """Streams and films older than KEEP_DAYS go; then the oldest until all of them fit in CAP. The newest of each
    (the session or film being made) always stays."""
    home, now = Path(home), now or datetime.datetime.now().timestamp()
    streams = sorted((home / "streams").glob("*.jsonl"), key=lambda p: p.stat().st_mtime) if (home / "streams").is_dir() else []
    films = sorted((d for d in (home / "film").iterdir() if d.is_dir()), key=lambda d: d.stat().st_mtime) if (home / "film").is_dir() else []
    items = [(p.stat().st_mtime, p) for p in streams[:-1] + films[:-1]]
    keep = [p for p in streams[-1:] + films[-1:]]
    total = sum(size(p) for _, p in items) + sum(size(p) for p in keep)
    gone = 0
    for mtime, p in sorted(items, key=lambda x: x[0]):
        if now - mtime < KEEP_DAYS * 86400 and total <= CAP:
            continue
        total -= size(p)
        shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        gone += 1
    return gone


def log_events(home, day=None):
    """events.log as office events: a stage change as `stage`, anything else as `event`."""
    f = Path(home) / "events.log"
    out = []
    for line in f.read_text(errors="replace").splitlines() if f.exists() else []:
        m = LINE.match(line)
        if not m or (day and not m.group(1).startswith(day)):
            continue
        at, fid, text = m.groups()
        head, _, rest = text.partition(": ")
        if head in STAGES:
            out.append({"at": at, "job": fid, "role": "loop", "kind": "stage", "stage": head, "note": rest or None})
        else:
            out.append({"at": at, "job": fid, "role": "loop", "kind": "event", "text": text})
    return out


def day_events(home, day, job=None):
    """Everything the office saw on `day` (YYYY-MM-DD), oldest first, numbered from 1. Without `job`, the Write and
    Edit input as it streamed (tool_delta) is left out to keep a day light; with it, that job's is kept."""
    home = Path(home)
    start = datetime.datetime.fromisoformat(day).timestamp()  # ValueError for a day that is not a date (the route says 404)
    events = log_events(home, day)
    for f in (home / "streams").glob("*.jsonl") if (home / "streams").is_dir() else []:
        if f.stat().st_mtime < start:  # nothing in it is from that day
            continue
        for line in f.read_text(errors="replace").splitlines():
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if not str(e.get("at", "")).startswith(day) or e.get("role") == "loop":  # loop events come from events.log
                continue
            if e.get("kind") == "tool_delta" and e.get("job") != job:
                continue
            events.append(e)
    events.sort(key=lambda e: e["at"])
    return [{**e, "id": i} for i, e in enumerate(events, 1)]


def days(home):
    """The days with something in events.log, newest first, with what merged and failed."""
    out = collections.OrderedDict()
    for e in log_events(home):
        d = out.setdefault(e["at"][:10], {"day": e["at"][:10], "merged": 0, "events": 0})
        d["events"] += 1
        d["merged"] += e.get("stage") == "merged"
    summaries = Path(home) / "history" / "summary"
    for d in out.values():
        d["summary"] = (summaries / f"{d['day']}.md").exists()
    return sorted(out.values(), key=lambda d: d["day"], reverse=True)


def stats(home, state):
    """Each merged feature (cost, minutes from start to merge, sessions, fix rounds), and each week's CI failures."""
    rows = [{"id": j["id"], "title": j.get("title", ""), "merged_at": j.get("merged_at") or j.get("updated", ""),
             "minutes": round(j.get("lead_seconds", 0) / 60), "cost": round(j.get("cost", 0), 2),
             "sessions": len(j.get("sessions") or []), "fix_rounds": j.get("fix_rounds", 0), "quality": j.get("quality")}
            for j in state.get("jobs", {}).values() if j.get("stage") == "merged" and re.match(r"^[FBD]", j["id"])]
    rows.sort(key=lambda r: r["merged_at"])
    weeks = collections.defaultdict(lambda: {"merged": 0, "ci_failed": 0})
    for r in rows:
        weeks[week(r["merged_at"])]["merged"] += 1
    f = Path(home) / "failures.jsonl"
    for line in f.read_text(errors="replace").splitlines() if f.exists() else []:
        try:
            x = json.loads(line)
        except ValueError:
            continue
        if x.get("kind") == "ci failed on the pr" and x.get("at"):
            weeks[week(x["at"])]["ci_failed"] += 1
    minutes = [r["minutes"] for r in rows if r["minutes"]]
    return {"features": rows, "weeks": [{"week": w, **v} for w, v in sorted(weeks.items())],
            "median_minutes": statistics.median(minutes) if minutes else None}


# Why a feature of the milestone in progress is not moving, as the office's wait map colours it (v9, P38).
WAIT_KIND = {"waiting_base": "base", "ci": "ci", "merging": "ci", "held": "you", "needs_human": "you", "failed": "you",
             "reverted": "you", "building": "work", "review": "work", "fixing": "work", "merged": "done",
             "dropped": "done"}


def _epoch(stamp):
    return datetime.datetime.fromisoformat(stamp).timestamp()


def milestone(root, home, state, now=None):
    """The milestone in progress for the office (v9, P38): how long it has run beside the milestones before it, a
    guess at when it is done, and why each of its features waits (the design, the dispatcher's plan, files another
    feature holds, a base PR, CI, the owner). Its first build is its design job's or a feature's, whichever came first."""
    import backlog
    now = now or __import__("time").time()
    feats = backlog.read(root)
    jobs = state.get("jobs", {})
    by_ms = {}
    for f in feats:
        if f.get("milestone"):
            by_ms.setdefault(f["milestone"], []).append(f)

    def span(ms):
        mine = [jobs[i] for i in [f["id"] for f in by_ms[ms]] + [f"D-{ms}"] if i in jobs]
        starts = [j["first_started"] for j in mine if j.get("first_started")]
        ends = [_epoch(j["merged_at"]) for j in mine if j.get("merged_at")]
        done = all(f.get("status") == "passing" for f in by_ms[ms])
        return (min(starts) if starts else None), (max(ends) if done and ends else None)

    past = []
    for ms in by_ms:
        start, end = span(ms)
        if start and end:
            past.append({"id": ms, "hours": round((end - start) / 3600, 1)})
    passing = {f["id"] for f in feats if f.get("status") == "passing"}
    # Merged: passing, and its job (if the loop still has one) merged. A feature passes its verifier before its PR
    # merges, and can go back to fixing after: the web trial's F064 showed as merged with PR #172 open (5.40.1).
    merged = {i for i in passing if (jobs.get(i) or {}).get("stage", "merged") == "merged"}
    current = next((ms for ms in by_ms if any(f["id"] not in merged for f in by_ms[ms])), None)
    if not current:
        return {"current": None, "past": past[-4:]}
    dj = jobs.get(f"D-{current}") or {}
    designed = (Path(root) / f"docs/design/{current}.md").exists() or dj.get("stage") in ("ci", "waiting_base", "merging")
    planning = (state.get("planning") or {}).get(current)
    rows = []
    for f in by_ms[current]:
        j = jobs.get(f["id"]) or {}
        stage = "merged" if f["id"] in merged else j.get("stage") or "queued"
        kind, why = WAIT_KIND.get(stage, "work"), j.get("note") or ""
        if stage in ("held", "needs_human", "failed"):
            why = j.get("question") or why
        if stage == "queued":
            deps = [d for d in f.get("depends_on", []) if d not in passing]
            if not designed:
                kind, why = "design", f"waits for its design (D-{current}, {dj.get('stage') or 'not started'})"
            elif planning:
                kind, why = "plan", "waits for the dispatcher's plan of the milestone"
            elif f["id"] in (state.get("lease_waits") or {}):
                kind, why = "files", state["lease_waits"][f["id"]]
            elif deps:
                kind, why = "deps", "needs " + ", ".join(deps)
            else:
                kind, why = "lane", "waits for a free lane"
        rows.append({"id": f["id"], "title": f.get("title", ""), "complexity": f.get("complexity"), "stage": stage,
                     "wait": kind, "why": why[:300], "pr": j.get("pr"), "pr_url": j.get("pr_url")})
    start, _ = span(current)
    done = sum(1 for r in rows if r["wait"] == "done")
    elapsed = now - start if start else 0
    left = round(elapsed / done * (len(rows) - done)) if done and start else None
    return {"current": {"id": current, "started": start, "elapsed_seconds": round(elapsed), "done": done,
                        "total": len(rows), "left_seconds": left, "planning": bool(planning),
                        "design": dj.get("stage"), "features": rows},
            "past": past[-4:]}


def roadmap(root, home, state):
    """The backlog as the office's Roadmap shows it (DESIGN.md 14.14): each feature with its stage, dependencies and
    acceptance; each milestone's progress, cost and a guess at when it is done; and the next features to start, why."""
    import backlog
    feats = backlog.read(root)
    jobs = state.get("jobs", {})
    median = stats(home, state)["median_minutes"]
    lanes = max(1, state.get("lanes") or 1)
    passing = {f["id"] for f in feats if f.get("status") == "passing"}
    out = [{"id": f["id"], "title": f.get("title", ""), "milestone": f.get("milestone"), "priority": f.get("priority", 0),
            "type": f.get("type"), "depends_on": f.get("depends_on", []), "acceptance": f.get("acceptance", []),
            "status": f.get("status"), "stage": (jobs.get(f["id"]) or {}).get("stage")} for f in feats]
    milestones = []
    for ms in dict.fromkeys(f["milestone"] for f in out if f["milestone"]):
        mine = [f for f in out if f["milestone"] == ms]
        left = sum(1 for f in mine if f["id"] not in passing)
        milestones.append({"id": ms, "done": len(mine) - left, "total": len(mine),
                           "cost": round(sum((jobs.get(f["id"]) or {}).get("cost", 0) for f in mine), 2),
                           "eta_minutes": round(left * median / lanes) if median and left else None})
    busy = {fid for fid, j in jobs.items() if j.get("stage") not in (None, "merged", "dropped", "failed", "queued")}
    ready = sorted((f for f in out if f["status"] == "failing" and f["id"] not in busy and all(d in passing for d in f["depends_on"])),
                   key=lambda f: (f["type"] != "bug", f["priority"]))
    nxt = [{"id": f["id"], "title": f["title"], "why": "bug" if f["type"] == "bug" else
            ("ready: needs " + ", ".join(f["depends_on"]) + ", all merged") if f["depends_on"] else "ready", "priority": f["priority"]}
           for f in ready[:5]]
    return {"features": out, "milestones": milestones, "next": nxt}


TREE_MAX = 20_000
_trees = {}


def tree(path):
    """The files of a checkout (git ls-files), each with its line count, for the office's code city (DESIGN.md 14.14).
    Binary files count 0 lines; .env* files are left out. Cached by HEAD and the dirty state."""
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=path, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(["git", "status", "--porcelain"], cwd=path, capture_output=True, text=True).stdout
    key = (str(path), head, hash(dirty))
    if key in _trees:
        return _trees[key]
    names = subprocess.run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=path,
                           capture_output=True).stdout.decode(errors="replace").split("\0")
    files = []
    for n in names[:TREE_MAX]:
        if not n or Path(n).name.startswith(".env"):
            continue
        f = Path(path) / n
        try:
            data = f.read_bytes()[:2_000_000]
        except OSError:
            continue
        files.append({"path": n, "lines": 0 if b"\0" in data[:8192] else data.count(b"\n") + (1 if data and not data.endswith(b"\n") else 0)})
    out = {"head": head[:12], "files": files, "cut": len(names) > TREE_MAX}
    if len(_trees) > 16:
        _trees.clear()
    _trees[key] = out
    return out


def records(home, state, today=None):
    """The office's records (DESIGN.md 14.14), plain numbers from what the loop keeps: days in a row main stayed
    green (now and best), the cheapest and the fastest feature, each week's share merged without a fix round, the
    bugs review caught by lens, the verifier's PASS and FAIL, and the hours features waited on the owner."""
    home = Path(home)
    today = today or datetime.date.today().isoformat()
    fails = []
    f = home / "failures.jsonl"
    for line in f.read_text(errors="replace").splitlines() if f.exists() else []:
        with contextlib.suppress(ValueError):
            fails.append(json.loads(line))
    events = log_events(home)
    red = {x["at"][:10] for x in fails if str(x.get("kind", "")).startswith("main ci failed")}
    run, best = 0, 0
    if events:
        d, end = datetime.date.fromisoformat(events[0]["at"][:10]), datetime.date.fromisoformat(today)
        while d <= end:
            run = 0 if d.isoformat() in red else run + 1
            best = max(best, run)
            d += datetime.timedelta(days=1)
    done = [j for j in state.get("jobs", {}).values() if j.get("stage") == "merged" and re.match(r"^[FB]\d", j["id"]) and not j.get("kind")]
    pick = lambda key, rows: min(rows, key=key) if rows else None  # noqa: E731
    cheap = pick(lambda j: j.get("cost", 0), [j for j in done if j.get("cost")])
    fast = pick(lambda j: j["lead_seconds"], [j for j in done if j.get("lead_seconds")])
    weeks = collections.defaultdict(lambda: [0, 0])
    for j in done:
        w = weeks[week(j.get("merged_at") or j.get("updated") or today)]
        w[0] += 1
        w[1] += not j.get("fix_rounds") and not j.get("attempts")
    lens = collections.Counter()
    for x in fails:
        k = str(x.get("kind", ""))
        if k.startswith("review bug"):
            m = re.search(r"\(([\w-]+)\)", k)
            lens[m.group(1) if m else "reviewer"] += 1
    verdicts = collections.Counter()
    for s in (home / "streams").glob("*.jsonl") if (home / "streams").is_dir() else []:
        for line in s.read_text(errors="replace").splitlines():
            if '"verdict"' in line:
                with contextlib.suppress(ValueError):
                    e = json.loads(line)
                    if e.get("kind") == "verdict" and e.get("verdict") in ("PASS", "FAIL"):
                        verdicts[e["verdict"]] += 1
    waited, since = 0.0, {}
    for e in events:
        if e["kind"] != "stage":
            continue
        t = datetime.datetime.fromisoformat(e["at"]).timestamp()
        if e["job"] in since:
            waited += t - since.pop(e["job"])
        if e["stage"] in ("needs_human", "held"):
            since[e["job"]] = t
    return {"main_green": {"now": run, "best": best},
            "cheapest": cheap and {"id": cheap["id"], "title": cheap.get("title", ""), "cost": round(cheap["cost"], 2)},
            "fastest": fast and {"id": fast["id"], "title": fast.get("title", ""), "minutes": round(fast["lead_seconds"] / 60)},
            "first_pass": [{"week": w, "merged": n, "first": k} for w, (n, k) in sorted(weeks.items())][-8:],
            "review_bugs": dict(lens.most_common()), "verifier": {"pass": verdicts["PASS"], "fail": verdicts["FAIL"]},
            "waiting_hours": round(waited / 3600, 1)}


def week(stamp):
    d = datetime.date.fromisoformat(stamp[:10])
    return (d - datetime.timedelta(days=d.weekday())).isoformat()  # the Monday


def facts(home, state, day):
    """What a day's summary is written from: numbers and event titles only, no code."""
    events = log_events(home, day)
    merged = [e["job"] for e in events if e.get("stage") == "merged"]
    jobs = state.get("jobs", {})
    spent = sum(s.get("cost", 0) for j in jobs.values() for s in j.get("sessions") or [] if str(s.get("ended", "")).startswith(day))
    f = Path(home) / "failures.jsonl"
    fails = collections.Counter()
    for line in f.read_text(errors="replace").splitlines() if f.exists() else []:
        try:
            x = json.loads(line)
        except ValueError:
            continue
        if str(x.get("at", "")).startswith(day):
            fails[x.get("kind", "?")] += 1
    return {"day": day, "merged": [{"id": i, "title": jobs.get(i, {}).get("title", "")} for i in merged],
            "spent": round(spent, 2), "failures": dict(fails.most_common(6)),
            "waiting": [{"id": j["id"], "question": j.get("question")} for j in jobs.values() if j.get("stage") in ("needs_human", "held")],
            "alerts": [e["text"][7:] for e in events if e.get("text", "").startswith("alert: ")][:10],
            "events": [f"{e['at'][11:16]} {e['job']} {e.get('stage') or e.get('text')}" for e in events][-80:]}


def plain(f):
    """A summary without Claude: when the budget has no room, the summary is off, or Claude did not answer."""
    say = lang.say
    lines = [f"# {f['day']}", ""]
    lines.append(say("Merged {n}: {list}", n=len(f["merged"]), list=", ".join(f"{m['id']} {m['title']}" for m in f["merged"]))
                 if f["merged"] else say("Nothing merged."))
    lines.append(say("Spent ${spent}.", spent=f"{f['spent']:.2f}"))
    if f["failures"]:
        lines.append(say("Stumbles: {list}.", list=", ".join(f"{k} ({n})" for k, n in f["failures"].items())))
    if f["waiting"]:
        lines.append(say("Waiting on you: {list}.", list=", ".join(w["id"] for w in f["waiting"])))
    return "\n".join(lines) + "\n"


PROMPT = """You write the end-of-day note for the owner of an autonomous build loop. They read it the next morning.
Below is what happened on {day}, as JSON: features merged, money spent, failures by kind, what waits on them,
alerts, and the day's event lines. Write 4 to 8 short sentences of plain prose, no headings, no lists: what got
done, where the agents stumbled and why it matters, what waits on the owner. Use the feature ids. Do not invent
anything that is not in the data. Do not use tools. Write in {language}.

{data}"""


def summarize(home, state, day, claude="claude", room=True, run=subprocess.run):
    """Writes history/summary/<day>.md and returns what it cost. Claude (the cheapest model, one turn, no tools,
    at most SUMMARY_COST) when `room` says the budget allows it, else the plain one."""
    out = Path(home) / "history" / "summary" / f"{day}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    f = facts(home, state, day)
    text, cost = None, 0.0
    if room and os.environ.get("LOOP_DAILY_SUMMARY") != "0":
        try:
            r = run([claude, "-p", PROMPT.format(day=day, data=json.dumps(f, indent=1), language="Vietnamese" if lang.lang() == "vi" else "English"), "--model", "haiku",
                     "--max-turns", "1", "--max-budget-usd", str(SUMMARY_COST), "--output-format", "json",
                     "--strict-mcp-config", "--disallowedTools", "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Agent,Task"],
                    cwd=home, capture_output=True, text=True, timeout=180)
            res = json.loads(r.stdout)
            cost = float(res.get("total_cost_usd") or 0)
            if res.get("subtype") == "success" and (res.get("result") or "").strip():
                text = f"# {day}\n\n{res['result'].strip()}\n"
        except (OSError, ValueError, subprocess.TimeoutExpired, AttributeError):
            pass
    out.write_text(text or plain(f))
    return cost
