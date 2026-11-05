#!/usr/bin/env python3
"""Alerts (DESIGN.md 14.13): five rules over what the loop's sessions do, checked each tick, office open or not.

  quiet    a lane in building, review or fixing with no event for 10 minutes
  circles  the same file edited 8 times in 15 minutes
  red      the same test failing 3 runs in a row
  context  a session (or subagent) past 85% of its model's context window
  budget   80% of the run's budget spent

They only tell: the loop goes on as before (its 90-minute session timeout still holds). Each alert is one per
(job, rule), then quiet for 30 minutes. Every rule is a pure function of the events and the state, tested in
tests/test_watch.py. LOOP_ALERTS=0 turns them off.
"""
import collections
import datetime
import json
from pathlib import Path

QUIET = datetime.timedelta(minutes=10)
CIRCLES, CIRCLE_WINDOW = 8, datetime.timedelta(minutes=15)
RED = 3
CONTEXT = 0.85
BUDGET = 0.8
AGAIN = datetime.timedelta(minutes=30)
LANE = {"building", "review", "fixing"}


def at(e):
    try:
        return datetime.datetime.fromisoformat(e["at"])
    except (KeyError, TypeError, ValueError):
        return None


def quiet(events, state, now):
    """Only once a session has said something since the lane's last stage change: a lane still waiting for the
    machine (machine_busy) has no session to be stuck."""
    last, talked = {}, set()
    for e in events:
        t, fid = at(e), e.get("job")
        if not t or not fid:
            continue
        last[fid] = max(last.get(fid, t), t)
        if e.get("kind") == "stage":
            talked.discard(fid)
        elif e.get("role") != "loop":
            talked.add(fid)
    for fid, job in state.get("jobs", {}).items():
        if job.get("stage") in LANE and fid in talked and now - last[fid] >= QUIET:
            mins = int((now - last[fid]).total_seconds() // 60)
            yield fid, ("no news for {m} min in {stage}", {"m": mins, "stage": job["stage"]}), \
                ("It may be thinking hard, or stuck on a command. Open Focus on it; the session times out at 90 minutes.", {})


def circles(events, state, now):
    count = collections.Counter()
    for e in events:
        t = at(e)
        if e.get("kind") == "file_edit" and t and now - t <= CIRCLE_WINDOW:
            count[(e.get("job"), e.get("path"))] += 1
    for (fid, path), n in count.items():
        if n >= CIRCLES and fid in state.get("jobs", {}):
            yield fid, ("edited {path} {n} times in 15 min", {"path": path, "n": n}), ("It may be going in circles on this file.", {})


def red(tests_dir, state):
    """From the kit reporters' files (harness/reporters/), which every session writes, watched or not."""
    for fid, job in state.get("jobs", {}).items():
        f = Path(tests_dir) / f"{fid}.jsonl"
        if job.get("stage") not in LANE or not f.exists():
            continue
        runs = collections.defaultdict(list)
        for line in f.read_text(errors="replace").splitlines()[-2000:]:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if isinstance(d, dict) and d.get("event") == "end":
                runs[(d.get("file"), d.get("name"))].append(d.get("status"))
        for (file, name), seen in runs.items():
            if len(seen) >= RED and all(s == "fail" for s in seen[-RED:]):
                yield fid, ("'{name}' failed {n} runs in a row", {"name": name, "n": RED}), ("The same test keeps failing ({file}).", {"file": file})
                break


def context(events, state, now):
    latest = {}
    for e in events:
        if e.get("kind") == "usage" and e.get("window"):
            latest[(e.get("job"), e.get("parent") or e.get("role"))] = e
    for (fid, who), e in latest.items():
        share = e["context"] / e["window"]
        if share >= CONTEXT and fid in state.get("jobs", {}) and state["jobs"][fid].get("stage") in LANE:
            tpl = "the session is at {p}% of its context" if who == "main" else "the {role} subagent is at {p}% of its context"
            yield fid, (tpl, {"p": round(100 * share), "role": e.get("role")}), \
                ("Claude Code compacts it soon; earlier details may be lost.", {})


def budget(state):
    spent, cap = state.get("spent") or 0, state.get("budget") or 0
    if cap and spent >= BUDGET * cap:
        yield "loop", ("spent ${spent} of ${budget}", {"spent": f"{spent:.2f}", "budget": cap}), ("The loop stops taking features at the budget.", {})


def rule_key(rule, detail, state):
    """Budget alerts come once per tenth of the budget (80%, 90%...), not every half hour."""
    if rule != "budget":
        return rule
    return f"budget{int(10 * (state.get('spent') or 0) / (state.get('budget') or 1))}"


class Watch:
    def __init__(self):
        self.said = {}  # (job, rule) -> when it was last said

    def check(self, events, state, tests_dir, now=None):
        """The alerts due now: [{rule, job, detail, hint}] in English, and the templates and values (detail_key, hint_key,
        params) that the office and lang.py say in the owner's language. Each (job, rule) at most every 30 minutes."""
        now = now or datetime.datetime.now()
        found = [("quiet", a) for a in quiet(events, state, now)] + [("circles", a) for a in circles(events, state, now)] \
            + [("red", a) for a in red(tests_dir, state)] + [("context", a) for a in context(events, state, now)] \
            + [("budget", a) for a in budget(state)]
        out = []
        for rule, (fid, (detail_key, params), (hint_key, hint_params)) in found:
            detail, hint = detail_key.format(**params), hint_key.format(**hint_params)
            key = (fid, rule_key(rule, detail, state))
            if rule == "budget" and key in self.said or now - self.said.get(key, datetime.datetime.min) < AGAIN:
                continue
            self.said[key] = now
            out.append({"rule": rule, "job": fid, "detail": detail, "hint": hint, "detail_key": detail_key, "hint_key": hint_key,
                        "params": {**params, **hint_params}})
        return out
