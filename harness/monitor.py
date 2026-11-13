#!/usr/bin/env python3
"""Monitoring (DESIGN.md 18): rules over the loop's own state turn into incidents the owner is told about.

Each tick `Monitor.check(loop)` asks every rule whether it holds. A rule that starts to hold opens an incident
(incidents.jsonl, state["monitor"]["open"]) and is pushed once; an urgent one is pushed again every 30 minutes
until the owner taps "Got it" (at most 3 times); a rule that stops holding closes its incident with "Resolved".
Between LOOP_QUIET hours (23-7) only urgent pushes ring: the rest go out silent (ntfy priority 2).

  A2  urgent  main red for more than LOOP_RED_MINUTES (60), counted while the loop runs and the Mac is awake
  A4          a feature in the same stage for more than LOOP_STUCK_HOURS (3), not counting time waiting on the
              owner, the usage limit, the network, or (queued) for a lane; all stuck features are one incident
  A5          no merge for LOOP_IDLE_HOURS (6) while work that does not wait on the owner is open
  A7          the same test failed CI on 3 or more different PRs within 24 hours: likely shared, not the PRs' fault
  A8          an error in the loop's own code with a signature not seen in 90 days (told once)
  A11         Docker or a stack service failing its probe for 10 minutes; free disk under LOOP_DISK_GB (15)
  A12         Claude Code logged out for 20 minutes; Claude's API unreachable for 60 minutes
  A13 shown   the machine too busy to take sessions for 2 hours (shown, never pushed)

Time is counted on the monotonic clock, which stops while the Mac sleeps, so a night asleep is not "stuck".
"Got it" works from anywhere: the push's button posts "ack <id>" to a second random ntfy topic, which the loop
reads; nothing has to reach the Mac. LOOP_MONITOR=0 turns it all off.
"""
import datetime
import hashlib
import json
import os
import re
import threading
import time
import traceback
import urllib.request
from pathlib import Path

import lang
import notify

DONE = {"merged", "dropped"}
WAITING_HUMAN = {"needs_human", "held", "failed", "reverted"}

QUIET = os.environ.get("LOOP_QUIET", "23-7")
RED_MIN = float(os.environ.get("LOOP_RED_MINUTES", "60"))
STUCK_H = float(os.environ.get("LOOP_STUCK_HOURS", "3"))
IDLE_H = float(os.environ.get("LOOP_IDLE_HOURS", "6"))
BUSY_H = float(os.environ.get("LOOP_BUSY_HOURS", "2"))
DISK_GB = float(os.environ.get("LOOP_DISK_GB", "15"))
PROBE_MIN, AUTH_MIN, API_MIN = 10, 20, 60
SHARED_PRS, SHARED_WINDOW = 3, 24 * 3600
REPEAT, REPEATS = 1800, 3
SEEN_DAYS = 90
ACK_EVERY = 60
STEP_MAX = 900  # the most one tick adds to a clock (a long tick, not a sleep: the monotonic clock skips sleep)


def enabled():
    return os.environ.get("LOOP_MONITOR") != "0"


def quiet_now(at=None, spec=None):
    """Whether `at` (a datetime, default now) falls in the quiet hours "start-end" (24 h, may wrap midnight)."""
    spec = QUIET if spec is None else spec
    m = re.fullmatch(r"\s*(\d{1,2})\s*-\s*(\d{1,2})\s*", spec or "")
    if not m:
        return False
    start, end, hour = int(m.group(1)) % 24, int(m.group(2)) % 24, (at or datetime.datetime.now()).hour
    if start == end:
        return False
    return start <= hour < end if start < end else (hour >= start or hour < end)


def span(seconds):
    m = int(seconds // 60)
    return f"{m // 60}h{m % 60:02d}" if m >= 60 else f"{m} min"


# what CI said ------------------------------------------------------------------------------
PLAYWRIGHT = re.compile(r"\[[\w-]+\] › ([\w./@-]+\.(?:spec|test)\.[jt]sx?):\d+:\d+ › (.+?)\s*(?:\(\d.*)?$", re.M)
VITEST = re.compile(r"(?:FAIL|×)\s+([\w./@-]+\.(?:spec|test)\.[jt]sx?)\s+>\s+(.+?)\s*(?:\d+\s?ms)?$", re.M)


def failed_tests(log):
    """The names ("file › title") of the tests a CI log says failed (Playwright and Vitest reporters)."""
    names = set()
    for rx in (PLAYWRIGHT, VITEST):
        for f, title in rx.findall(log or ""):
            names.add(f"{f} › {title.strip()[:120]}")
    return names


def note_ci_failures(state, fid, log, at=None):
    """Record which tests failed CI on fid's PR, for A7. Called where the loop reads a failed PR run's log."""
    at = at or time.time()
    seen = state.setdefault("monitor", {}).setdefault("ci_tests", {})
    for name in failed_tests(log):
        seen.setdefault(name, {})[fid] = at
    for name in list(seen):  # forget what is out of the window
        seen[name] = {f: t for f, t in seen[name].items() if at - t < SHARED_WINDOW}
        if not seen[name]:
            del seen[name]


# errors in the loop's own code (A8) ---------------------------------------------------------
def signature(e):
    """What an error is, without the parts that change between occurrences: its type, its message with numbers,
    ids and quoted values blanked, and the kit file and function it was raised in."""
    msg = re.sub(r"'[^']*'|\"[^\"]*\"", "<s>", str(e))
    msg = re.sub(r"\b[FDRL]-?[0-9a-f]{2,}\b|\d+", "<n>", msg)[:160]
    where = ""
    for fr in traceback.extract_tb(e.__traceback__):
        if "/harness/" in fr.filename.replace("\\", "/"):
            where = f"{Path(fr.filename).name}:{fr.name}"
    return f"{type(e).__name__}: {msg}" + (f" ({where})" if where else "")


def note_error(loop, e, where="tick"):
    """An error in the loop's own code: told once per signature in SEEN_DAYS (errors-seen.json beside the state)."""
    if not enabled():
        return False
    sig = signature(e)
    path = Path(loop.home) / "errors-seen.json"
    try:
        seen = json.loads(path.read_text())
    except (OSError, ValueError):
        seen = {}
    cutoff = (datetime.datetime.now() - datetime.timedelta(days=SEEN_DAYS)).isoformat(timespec="seconds")
    seen = {k: v for k, v in seen.items() if v >= cutoff}
    new = sig not in seen
    seen[sig] = datetime.datetime.now().isoformat(timespec="seconds")
    try:
        path.write_text(json.dumps(seen, indent=1))
    except OSError:
        pass
    if new:
        iid = "A8-" + hashlib.sha1(sig.encode()).hexdigest()[:6]
        record(loop.home, {"id": iid, "rule": "A8", "event": "open", "title": sig, "where": where})
        loop.event("loop", f"incident {iid}: new error in the loop ({where}): {sig}")
        loop.push(f"inc:{iid}", lang.say("New error in the loop"), sig[:300])
    return new


def record(home, row):
    row = {"at": datetime.datetime.now().isoformat(timespec="seconds"), **row}
    try:
        with (Path(home) / "incidents.jsonl").open("a") as f:
            f.write(json.dumps(row) + "\n")
    except OSError:
        pass


# "Got it" from the phone ------------------------------------------------------------------------
def ack_topic(home):
    """The push config with the second topic the "Got it" button posts to, made beside the push topic on first use."""
    cfg = notify.config(home)
    if not cfg:
        return None
    if not cfg.get("ack_topic"):
        cfg["ack_topic"] = cfg["topic"] + "-ack"
        try:
            (Path(home) / "notify.json").write_text(json.dumps(cfg, indent=2) + "\n")
        except OSError:
            return None
    return cfg


def read_acks(cfg, since):
    """The incident ids acknowledged on the ack topic since `since` (unix seconds), and the newest time seen."""
    url = f"{cfg['url']}/{cfg['ack_topic']}/json?poll=1&since={int(since)}"
    ids, newest = set(), since
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            for line in r.read().decode().splitlines():
                try:
                    m = json.loads(line)
                except ValueError:
                    continue
                newest = max(newest, m.get("time", 0))
                words = (m.get("message") or "").split()
                if len(words) == 2 and words[0] == "ack":
                    ids.add(words[1])
    except Exception:
        pass
    return ids, newest


class Monitor:
    def __init__(self):
        self.mono = None  # the monotonic clock at the last check
        self.acks = set()  # read by the background poll, applied on the next check
        self.ack_poll = 0.0
        self.polling = False

    def step(self):
        t = time.monotonic()
        dt = 0.0 if self.mono is None else min(max(t - self.mono, 0.0), STEP_MAX)
        self.mono = t
        return dt

    def check(self, loop, dt=None):
        """One look, each tick. dt (seconds of awake time since the last look) is for tests."""
        if not enabled():
            return {}
        st = loop.state.setdefault("monitor", {})
        dt = self.step() if dt is None else dt
        found = self.rules(loop, st, dt)
        self.apply_acks(loop, st)
        self.reconcile(loop, st, found)
        self.poll_acks(loop)
        return found

    def rules(self, loop, st, dt):
        """{key: finding} for every rule that holds now. A finding: rule, urgent, shown (never pushed), title, text."""
        state, found = loop.state, {}
        jobs = list(state.get("jobs", {}).values())
        now = time.time()
        frozen = now < (state.get("paused_until") or 0) or bool(state.get("offline_since"))  # nothing can move

        # A2 main red
        st["red"] = st.get("red", 0.0) + dt if state.get("main_red") else 0.0
        if state.get("main_red") and st["red"] >= RED_MIN * 60:
            by = (state.get("main_red_by") or "").replace("R-", "")
            found["A2"] = dict(rule="A2", urgent=True, title=lang.say("Main red for {t}", t=span(st["red"])),
                               text=lang.say("Since {id}; nothing merges until main is green.", id=by))

        # A4 stuck features
        clocks, free = st.setdefault("stuck", {}), self.free_lane(loop)
        stuck = []
        for j in jobs:
            fid, stage = j["id"], j["stage"]
            if stage in DONE or stage in WAITING_HUMAN:
                clocks.pop(fid, None)
                continue
            c = clocks.get(fid)
            if not c or c["stage"] != stage:
                c = clocks[fid] = {"stage": stage, "secs": 0.0}
            base = next((b for b in jobs if j.get("base") and b.get("branch") == j["base"]), None)
            if stage == "waiting_base" and base and base["stage"] in WAITING_HUMAN:
                pass  # its base waits on the owner: the owner already knows
            elif not frozen and (stage != "queued" or free):  # a queued job waiting for a lane is not stuck
                c["secs"] += dt
            if c["secs"] >= STUCK_H * 3600:
                why = (state.get("lease_waits") or {}).get(fid) or j.get("note") or ""
                stuck.append((fid, stage, c["secs"], why))
        ids = {j["id"] for j in jobs}
        for fid in [f for f in clocks if f not in ids]:
            clocks.pop(fid)
        if stuck:
            stuck.sort(key=lambda s: -s[2])
            text = "; ".join(f"{fid} {lang.say(stage)} {span(secs)}" + (f" ({why[:60]})" if why else "")
                             for fid, stage, secs, why in stuck[:4])
            found["A4"] = dict(rule="A4", urgent=False, title=lang.say("{n} stuck over {h} h", n=len(stuck), h=f"{STUCK_H:g}"),
                               text=text, jobs=[s[0] for s in stuck])

        # A5 no merge
        merged = sum(1 for j in jobs if j["stage"] == "merged")
        working = [j for j in jobs if j["stage"] not in DONE and j["stage"] not in WAITING_HUMAN]
        if merged != st.get("merged") or not working:
            st["merged"], st["idle"] = merged, 0.0
        elif not frozen:
            st["idle"] = st.get("idle", 0.0) + dt
        if st.get("idle", 0) >= IDLE_H * 3600:
            found["A5"] = dict(rule="A5", urgent=False, title=lang.say("Nothing merged for {t}", t=span(st["idle"])),
                               text=lang.say("{n} jobs still open.", n=len(working)))

        # A7 a test failing CI on several PRs
        for name, prs in sorted((st.get("ci_tests") or {}).items()):
            live = sorted(f for f, t in prs.items() if now - t < SHARED_WINDOW)
            if len(live) >= SHARED_PRS:
                key = "A7:" + hashlib.sha1(name.encode()).hexdigest()[:8]
                found[key] = dict(rule="A7", urgent=False,
                                  title=lang.say("'{name}' fails on {n} PRs", name=name.split(" › ")[-1][:60], n=len(live)),
                                  text=lang.say("Likely broken for everyone, not by these features: {list}.", list=", ".join(live)))

        # A11 local stack and disk
        if state.get("probe_failing") and now - (state.get("probe_since") or now) >= PROBE_MIN * 60:
            found["A11:probe"] = dict(rule="A11", urgent=False,
                                      title=lang.say("{what} is not answering", what=state["probe_failing"]),
                                      text=lang.say("For {t}; no new session starts until it answers.",
                                                    t=span(now - state["probe_since"])))
        disk = (getattr(loop, "health_now", None) or {}).get("disk_free_gb")
        if disk is not None and disk < DISK_GB:
            found["A11:disk"] = dict(rule="A11", urgent=False, title=lang.say("Disk nearly full"),
                                     text=lang.say("{gb} GB free; new sessions stop under 10 GB.", gb=disk))

        # A12 Claude logged out, or its API down
        if state.get("auth_since") and now - state["auth_since"] >= AUTH_MIN * 60:
            found["A12:auth"] = dict(rule="A12", urgent=False, title=lang.say("Claude Code is logged out"),
                                     text=lang.say("Run claude, then /login, on the Mac."))
        if state.get("infra_since") and now - state["infra_since"] >= API_MIN * 60:
            found["A12:api"] = dict(rule="A12", urgent=False, title=lang.say("Claude's API unreachable"),
                                    text=lang.say("For {t}; the loop waits and goes on by itself.",
                                                  t=span(now - state["infra_since"])))

        # A13 a busy machine (shown only)
        queued = any(j["stage"] == "queued" for j in jobs)
        st["busy"] = st.get("busy", 0.0) + dt if getattr(loop, "busy", None) and queued else 0.0
        if st["busy"] >= BUSY_H * 3600:
            found["A13"] = dict(rule="A13", urgent=False, shown=True,
                                title=lang.say("Machine too busy for {t}", t=span(st["busy"])), text=str(loop.busy))
        return found

    def free_lane(self, loop):
        """Whether a queued feature could start now: a lane free, and the machine, budget and day allowing it."""
        try:
            return loop.lanes_busy() < loop.lane_limit() and loop.can_start()
        except Exception:
            return False

    # incidents ------------------------------------------------------------------------------
    def reconcile(self, loop, st, found):
        opened = st.setdefault("open", {})
        now = time.time()
        for key, f in found.items():
            inc = opened.get(key)
            if not inc:
                iid = f"{f['rule']}-{hashlib.sha1(f'{key}{now}'.encode()).hexdigest()[:4]}"
                inc = opened[key] = {"id": iid, "rule": f["rule"], "urgent": f["urgent"], "shown": bool(f.get("shown")),
                                     "opened": now, "pushes": 0, "pushed_at": 0, "acked": False}
                record(loop.home, {"id": iid, "rule": f["rule"], "event": "open", "urgent": f["urgent"],
                                   "title": f["title"], "detail": f["text"]})
                loop.event("loop", f"incident {iid}: {f['title']} ({f['text'][:160]})")
                if f["rule"] == "A4":
                    self.tidy(loop, f.get("jobs", []))
            inc["title"], inc["text"] = f["title"], f["text"]
            if inc["shown"]:
                continue
            if inc["pushes"] == 0 or (inc["urgent"] and not inc["acked"] and inc["pushes"] <= REPEATS
                                      and now - inc["pushed_at"] >= REPEAT):
                self.tell(loop, inc)
        for key in [k for k in opened if k not in found]:
            inc = opened.pop(key)
            took = span(now - inc["opened"])
            record(loop.home, {"id": inc["id"], "rule": inc["rule"], "event": "resolve", "after": took})
            loop.event("loop", f"incident {inc['id']} resolved after {took}: {inc['title']}")
            if inc["pushes"]:
                loop.push(f"inc:{inc['id']}:ok", lang.say("Resolved: {title}", title=inc["title"]),
                          lang.say("It lasted {t}.", t=took))

    def tell(self, loop, inc):
        again = inc["pushes"] > 0
        inc["pushes"] += 1
        inc["pushed_at"] = time.time()
        if again:
            record(loop.home, {"id": inc["id"], "rule": inc["rule"], "event": "repeat", "n": inc["pushes"]})
        cfg = ack_topic(loop.home) if inc["urgent"] else None
        actions = [{"action": "http", "label": lang.say("Got it"), "url": f"{cfg['url']}/{cfg['ack_topic']}",
                    "method": "POST", "body": f"ack {inc['id']}", "clear": True}] if cfg else None
        loop.push(f"inc:{inc['id']}:{inc['pushes']}", inc["title"] + (" " + lang.say("(again)") if again else ""),
                  inc["text"], priority=5 if inc["urgent"] else 3, urgent=inc["urgent"], actions=actions)

    def tidy(self, loop, fids):
        """S3: when features look stuck, put right what the loop's own state got wrong, nothing else: a lane stage
        with no session behind it goes back to where it starts again, and a stale "waits for files" is forgotten."""
        threads = getattr(loop, "threads", {})
        for fid in fids:
            j = loop.state["jobs"].get(fid)
            if not j:
                continue
            if j["stage"] == "building" and fid not in threads:
                loop.set_stage(j, "queued", note="no session was building it (seen by the monitor); queued again")
            elif j["stage"] == "fixing" and fid not in threads:
                loop.set_stage(j, "review", note="no session was fixing it (seen by the monitor); reviewed again")
            if j["stage"] != "queued":
                (loop.state.get("lease_waits") or {}).pop(fid, None)

    def apply_acks(self, loop, st):
        acks, self.acks = self.acks, set()
        for inc in st.get("open", {}).values():
            if inc["id"] in acks and not inc["acked"]:
                inc["acked"] = True
                record(loop.home, {"id": inc["id"], "rule": inc["rule"], "event": "ack"})
                loop.event("loop", f"incident {inc['id']}: the owner has seen it")

    def poll_acks(self, loop):
        """Read the ack topic in the background, at most every ACK_EVERY seconds, while an urgent incident waits."""
        st = loop.state.get("monitor", {})
        if self.polling or time.time() - self.ack_poll < ACK_EVERY:
            return
        if not any(i["urgent"] and not i["acked"] and i["pushes"] for i in st.get("open", {}).values()):
            return
        cfg = ack_topic(loop.home)
        if not cfg:
            return
        self.ack_poll, self.polling = time.time(), True
        since = st.get("ack_since") or int(time.time() - 3 * 3600)

        def run():
            try:
                ids, newest = read_acks(cfg, since)
                self.acks |= ids
                st["ack_since"] = max(int(newest), since)
            finally:
                self.polling = False
        threading.Thread(target=run, daemon=True).start()


# backtest over an events.log --------------------------------------------------------------------
SLEPT = re.compile(r"slept: the Mac was asleep for about (\d+) min")
STAGES = {"queued", "building", "review", "fixing", "ci", "waiting_base", "merging"} | DONE | WAITING_HUMAN


def backtest(lines):
    """Replay events.log lines: the incidents A2, A4 and A5 would have opened, and the Mac's sleeps of 15 minutes or
    more (A3, for 5.43.0). Approximate: time asleep comes out through the `slept` events; lanes are not in the log,
    so a queued feature counts like any other stage. Stuck features found within STUCK_H of each other make one
    incident, as they do live; `n` says how many."""
    rows = []
    for line in lines:
        parts = line.rstrip("\n").split(None, 2)
        if len(parts) < 3:
            continue
        try:
            rows.append((datetime.datetime.fromisoformat(parts[0]), parts[1], parts[2]))
        except ValueError:
            continue
    sleeps = [(t, int(m.group(1)) * 60) for t, who, text in rows if who == "loop" and (m := SLEPT.match(text))]

    def awake(a, b):
        return (b - a).total_seconds() - sum(s for w, s in sleeps if a < w <= b)

    out, stages, reported, open_work = [], {}, set(), set()
    running, red_since, last_merge = False, None, None
    for t, who, text in rows:
        if running:
            for fid, (stage, since) in stages.items():
                if (stage not in DONE and stage not in WAITING_HUMAN and stage != "limit"
                        and awake(since, t) >= STUCK_H * 3600 and (fid, since) not in reported):
                    reported.add((fid, since))
                    last = next((h for h in reversed(out) if h["rule"] == "A4"), None)
                    if last and (t - last["seen"]).total_seconds() < STUCK_H * 3600:
                        last["n"], last["seen"] = last["n"] + 1, t
                        last["what"] += f", {fid}"
                    else:
                        out.append({"at": t, "seen": t, "n": 1, "rule": "A4", "id": fid,
                                    "what": f"{fid} {stage} {span(awake(since, t))}"})
        if who == "loop":
            if text.startswith(("started", "resumed")):
                running, last_merge = True, t
            elif text.startswith("stopped"):
                running = False
            m = SLEPT.match(text)
            if m and int(m.group(1)) >= 15:
                out.append({"at": t, "rule": "A3", "id": "loop", "what": f"slept {m.group(1)} min"})
            continue
        if "main is green again" in text and red_since:
            if awake(red_since, t) >= RED_MIN * 60:
                out.append({"at": t, "rule": "A2", "id": who, "what": f"main red {span(awake(red_since, t))}"})
            red_since = None
        stage = text.split(":", 1)[0].strip()
        if stage not in STAGES:
            continue
        if stage == "reverted":
            red_since = red_since or t
        if stage == "merged":
            if running and last_merge and open_work - {who} and awake(last_merge, t) >= IDLE_H * 3600:
                out.append({"at": t, "rule": "A5", "id": "loop", "what": f"no merge for {span(awake(last_merge, t))}"})
            last_merge = t
        kind = "limit" if "waits for the usage limit" in text else stage
        prev = stages.get(who)
        stages[who] = (kind, prev[1] if prev and prev[0] == kind else t)
        (open_work.discard if stage in DONE or stage in WAITING_HUMAN else open_work.add)(who)
    return out
