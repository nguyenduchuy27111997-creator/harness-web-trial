"""The dispatcher (DESIGN.md 15.4, P31; decide mode 16.3, P35): the loop asks an opus agent for its judgement when a
feature fails, a PR is held, main goes red or a milestone starts. Its advice goes to <home>/decisions.jsonl beside
what really happened next, and `loop.py decisions` shows them side by side. LOOP_DISPATCHER=suggest only writes it
down; LOOP_DISPATCHER=decide also acts on it, within the limits below, and tells the owner each time. A mixin of
loop.Loop."""

import json
import os
import re
import threading
import time
from pathlib import Path

from common import backlog, lang, now, write_answer, WAITING_HUMAN

MODE = os.environ.get("LOOP_DISPATCHER", "")  # "suggest" turns it on; "decide" lets it act (v9, P35)
# What it may do alone in decide mode: never drop a feature, change the backlog or its acceptance, and only when it is
# sure enough and has not already decided twice for this job; anything else stays with the owner. The owner's own
# answer still wins at any time.
ACTS = {"retry", "retry_large", "answer", "rebuild", "split"}
SURE = float(os.environ.get("LOOP_DISPATCHER_SURE", "0.7"))
MAX_DECISIONS = 2
PLAN_WAIT = 15 * 60  # seconds a milestone's features wait for its plan
CAP = float(os.environ.get("LOOP_DISPATCHER_CAP", "0.5"))  # dollars at most per question
EVENTS = {"held": "held", "failed": "failed", "reverted": "main red", "needs_human": "needs human"}


class Dispatcher:
    def consult(self, job, stage):
        """Ask the dispatcher about this job's new stage, in the background, once per situation."""
        # A milestone is asked about once its design PR is up (architect PASS): the doc and its shared scaffold are
        # there to read, so the touches it gives leave out what the scaffold already built.
        event = "milestone" if job.get("kind") == "design" and stage == "ci" else EVENTS.get(stage)
        # Not held back by a busy machine: it is one read-only call, and a busy machine is when PRs get held. Seen on
        # the web trial: at load 70-90 on 12 CPUs, F040 and F044 were held and the dispatcher was never asked.
        if (MODE not in ("suggest", "decide") or not event or job.get("kind") == "rule" or self.free_budget() < CAP
                or self.day_full()):
            return
        # A new hold after the owner answered is a new situation: seen on the web trial, F047's second hold had the key
        # of its first (same attempt, same fix round) and was never asked about.
        key = f"{job['id']}:{event}:{job.get('attempts', 0)}:{job.get('fix_rounds', 0)}:{len(job.get('answers', []))}"
        asked = self.state.setdefault("consulted", [])
        if key in asked:
            return
        asked[:] = asked[-199:] + [key]
        wt = job.get("worktree")
        probe = {**job, "id": f"{job['id']}-dispatcher",
                 "worktree": wt if wt and Path(wt).exists() else str(self.root)}  # its port, model, telemetry go here
        prompt = self.brief(job, event)
        box = {"began": time.time()}
        self.caps[probe["id"]] = CAP  # the run's budget counts it while it runs

        def ask():
            try:
                box["res"] = self.claude(probe, prompt, self.agent_model(job, "dispatcher"), turns=30,
                                         lane_note=False, agent="dispatcher", cap=CAP)
            except Exception as e:
                box["error"] = repr(e)
        t = threading.Thread(target=ask, daemon=True)
        self.__dict__.setdefault("advice", {})[key] = (t, box, job["id"], event, probe)
        if MODE == "decide" and event == "milestone":
            self.state.setdefault("planning", {}).setdefault(job.get("milestone"), time.time())
        t.start()

    def planning(self, ms):
        """Decide mode: the milestone's plan is being made, so its features wait for it, for at most PLAN_WAIT.
        Seen in CI: features stack on the design PR as soon as it is up, so the dispatcher's touches came a few
        minutes after the first wave had started and changed nothing."""
        began = self.state.get("planning", {}).get(ms)
        return bool(began) and time.time() - began < PLAN_WAIT

    def brief(self, job, event):
        f = self.main.get(job["id"], {}) if hasattr(self, "main") else {}
        lines = (self.home / "events.log").read_text().splitlines() if (self.home / "events.log").exists() else []
        mine = [x for x in lines if f"  {job['id']} " in x][-25:]
        if event == "milestone":
            ms = job.get("milestone")
            feats = [{k: x.get(k) for k in ("id", "title", "complexity", "depends_on", "acceptance", "touches") if x.get(k)}
                     for x in backlog.read(self.root, "origin/main") if x.get("milestone") == ms and x.get("status") != "passing"]
            return (f"Event: milestone {ms} starts; its design (docs/design/{ms}.md) and shared scaffold are on branch "
                    f"{job.get('branch')}, approved by the architect. Its features still to build:\n"
                    f"```json\n{json.dumps(feats, indent=1)[:12000]}\n```")
        facts = {"id": job["id"], "title": job.get("title") or f.get("title"), "complexity": f.get("complexity"),
                 "acceptance": f.get("acceptance"), "stage": job.get("stage"), "note": job.get("note"),
                 "question to the owner": job.get("question"), "attempts": job.get("attempts", 0),
                 "fix rounds": job.get("fix_rounds", 0), "last failure": job.get("last_failure"),
                 "review findings": job.get("last_bugs") or job.get("findings"), "branch": job.get("branch"),
                 "pr": job.get("pr_url"), "cost so far": round(job.get("cost", 0), 2)}
        return (f"Event: {event}. The job, as data:\n```json\n{json.dumps({k: v for k, v in facts.items() if v}, indent=1)[:8000]}\n```\n"
                "Its recent events:\n```\n" + "\n".join(mine) + "\n```")

    def collect_advice(self):
        """Write each answer the dispatcher gave, and what it cost, once it is done. On a run's first tick, ask about
        the jobs already waiting that it was never asked about (they went to waiting before it was on, or a run before)."""
        if not getattr(self, "swept", False):
            self.swept = True
            day = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - 86400))
            for job in list(self.state["jobs"].values()):
                if job["stage"] in EVENTS and job.get("updated", "") >= day:  # not every old failure: the last day's
                    self.consult(job, job["stage"])
        for key, (t, box, fid, event, probe) in list(getattr(self, "advice", {}).items()):
            if t.is_alive():
                continue
            del self.advice[key]
            self.caps.pop(probe["id"], None)
            cost, _, text = box.get("res", (0.0, "error", ""))
            job = self.job(fid)
            if job is not None:  # its cost counts like any session's, toward the run, the day and the feature
                job["cost"] = round(job.get("cost", 0) + cost, 4)
                job.setdefault("sessions", []).append({"stage": "dispatcher", "model": probe.get("last_model"),
                                                       "cost": round(cost, 4), "ended": now(),
                                                       "seconds": round(time.time() - box["began"]),
                                                       **probe.get("lens_telemetry", {}).get("dispatcher", {})})
            self.state["spent"] = round(self.state["spent"] + cost, 4)
            advice = parse(text)
            failed = box.get("res", (0, "error"))[1] != "success" or "error" in box or set(advice) == {"raw"}
            tries = self.state.setdefault("consult_tries", {})
            if failed and tries.get(key, 0) < 2 and job is not None:  # it was not asked at all: ask again
                tries[key] = tries.get(key, 0) + 1
                self.state["consulted"] = [k for k in self.state.get("consulted", []) if k != key]
                self.consult(job, "ci" if event == "milestone" else job["stage"])
                continue
            tries.pop(key, None)
            if event == "milestone":
                self.state.get("planning", {}).pop((job or {}).get("milestone"), None)  # answered or not, the wait is over
            if failed:  # asked three times, never answered: the reply is an error, not advice. Seen on the web trial:
                # "Failed to authenticate" was logged as F048's advice.
                error, advice = box.get("error") or (text or "no reply").strip()[:200], {}
            self.decide_log({"key": key, "at": now(), "job": fid, "event": event, "advice": advice,
                             "cost": round(cost, 4), **({"error": error} if failed else {})})
            if job is not None and event != "milestone":
                job["advice"] = key  # what happens to the job next is written beside it (outcome)
            if failed:
                self.event(fid, f"dispatcher could not answer: {error[:160]}")
                continue
            what = advice.get("action") or ("touches for " + ", ".join(advice["touches"]) if advice.get("touches") else "no advice")
            if job is not None and self.act(job, event, advice, key):
                continue
            self.event(fid, f"dispatcher would: {what}" + (f" ({advice['why'][:160]})" if advice.get("why") else ""))

    def act(self, job, event, advice, key):
        """Decide mode: answer the job with the dispatcher's advice, as the owner would with `loop.py answer`, when it
        is one it may take alone (ACTS), it is sure enough, the job still waits as it did when asked, and it has not
        already decided twice for this job. True when it acted."""
        if MODE == "decide" and event == "milestone":
            return self.plan_milestone(job, advice, key)
        action = advice.get("action")
        try:
            sure = float(advice.get("confidence") or 0)
        except (TypeError, ValueError):
            sure = 0.0
        if (MODE != "decide" or event == "milestone" or action not in ACTS or sure < SURE
                or job["stage"] not in WAITING_HUMAN or job["stage"] == "reverted"
                or job.get("decided", 0) >= MAX_DECISIONS
                or job.get("budget_held")  # past three times its budget: only the owner gives more
                or (action == "rebuild" and job.get("pr"))):  # an open PR's answer fixes the branch, never rebuilds it
            return False
        detail, why = (advice.get("detail") or "").strip(), (advice.get("why") or "").strip()
        text = {"retry": "Retry it as it is.", "retry_large": f"Retry it on the large model. {detail}",
                "answer": detail, "rebuild": f"Rebuild it from main: {detail}",
                "split": "Build it in these parts, one after another in this branch, keeping every acceptance "
                         f"criterion as it is:\n{detail}"}[action].strip()
        if not text:
            return False
        job["decided"] = job.get("decided", 0) + 1
        if action == "retry_large":
            job["large"] = True
        write_answer(self.home, job["id"], f"The dispatcher answered, not the owner (confidence {sure:.2f}; {why}): {text}")
        self.decide_log({"key": key, "at": now(), "job": job["id"], "applied": action})
        said = f"{action}" + (f" ({why[:160]})" if why else "")
        self.event(job["id"], f"dispatcher decided: {said}")
        self.push(f"decided:{key}", lang.say("Dispatcher decided"), f"{job['id']}: {said}")
        return True

    def plan_milestone(self, job, advice, key):
        """Decide mode, a milestone's start: take the dispatcher's `touches` for its features not started yet, in place
        of the backlog's, so features that share only what the design's scaffold already built can build side by
        side instead of stacked (v9, P35: waiting on a base PR was 23% of the web trial's lead time). The backlog
        itself is never changed."""
        touches = advice.get("touches")
        if not isinstance(touches, dict):
            return False
        ms, took = job.get("milestone"), {}
        for fid, globs in touches.items():
            f = self.main.get(fid, {}) if hasattr(self, "main") else {}
            started = (self.job(fid) or {}).get("stage", "queued") != "queued"
            if (f.get("milestone") == ms and f.get("status") != "passing" and not started and isinstance(globs, list)
                    and 0 < len(globs) <= 20 and all(isinstance(g, str) and g and not g.startswith("/") for g in globs)):
                took[fid] = globs
        if not took:
            return False
        self.state.setdefault("touches", {}).update(took)
        self.overlay_touches()
        self.decide_log({"key": key, "at": now(), "job": job["id"], "applied": "touches"})
        said = f"touches for {', '.join(sorted(took))}" + (f" ({advice['why'][:160]})" if advice.get("why") else "")
        self.event(job["id"], f"dispatcher decided: {said}")
        self.push(f"decided:{key}", lang.say("Dispatcher decided"), f"{ms}: {said}")
        return True

    def overlay_touches(self):
        """The dispatcher's touches over the backlog's, for features not passing yet."""
        for fid, globs in self.state.get("touches", {}).items():
            if fid in getattr(self, "main", {}) and self.main[fid].get("status") != "passing":
                self.main[fid] = {**self.main[fid], "touches": globs}

    def outcome(self, job, stage, note):
        """What really happened to a job the dispatcher was asked about: its next stage out of waiting, and the
        owner's answer if that was it."""
        key = job.get("advice")
        if not key or stage in WAITING_HUMAN:
            return
        job.pop("advice")
        self.decide_log({"key": key, "at": now(), "job": job["id"], "actual": {
            "stage": stage, "note": note, **({"answer": job["answers"][-1]} if job.get("answers") else {})}})

    def decide_log(self, row):
        with (self.home / "decisions.jsonl").open("a") as f:
            f.write(json.dumps(row) + "\n")


def parse(text):
    """The last JSON object in the reply, or the reply itself when there is none."""
    for m in reversed(list(re.finditer(r"\{.*\}", text or "", re.S))):
        try:
            return json.loads(m.group(0))
        except ValueError:
            continue
    return {"raw": (text or "").strip()[:500]}


def decisions(home):
    """Each question with its advice and, once known, what really happened: one row per question, oldest first."""
    f = Path(home) / "decisions.jsonl"
    by = {}
    for line in (f.read_text().splitlines() if f.exists() else []):
        if line.strip():
            r = json.loads(line)
            by.setdefault(r["key"], {}).update(r)
    return list(by.values())


def team(home):
    """For the office (/team.json, P33): who works on what now, each role's sessions, dollars and minutes over the
    merged features, what review caught, and the dispatcher's last advice beside what happened."""
    import metrics
    state = json.loads((Path(home) / "state.json").read_text()) if (Path(home) / "state.json").exists() else {}
    jobs = list(state.get("jobs", {}).values())
    merged = [j for j in jobs if metrics.FEATURE.match(j["id"]) and j.get("stage") == "merged"]
    failures = metrics.rows(Path(home) / "failures.jsonl")
    roles = metrics.roles(merged, failures)
    asked = [s for j in jobs for s in j.get("sessions", []) if s.get("stage") == "dispatcher"]
    roles["dispatcher"] = {"sessions": len(asked), "cost": round(sum(s.get("cost", 0) for s in asked), 2),
                           "minutes_p50": round(metrics.quantile([s.get("seconds", 0) / 60 for s in asked], 0.5))}
    return {"now": sorted(state.get("team", {}).values(), key=lambda m: (m["job"], m["role"])),
            "roles": roles, "dispatcher": MODE or "off", "decisions": decisions(home)[-20:]}


def report(home):
    """Each question, the dispatcher's advice and what really happened, newest last."""
    rows = decisions(home)
    out = []
    for r in rows:
        a = r.get("advice", {})
        said = a.get("action") or (f"touches for {len(a['touches'])} features" if a.get("touches") else a.get("raw", "")[:80])
        said = f"(no answer: {r['error'][:60]})" if r.get("error") else said
        did = r.get("actual")
        did = (f"{did['stage']}" + (f", owner said: {did['answer'][:80]}" if did.get("answer") else "")) if did else "still waiting"
        verb = "decided" if r.get("applied") else "would"
        out.append(f"{r.get('at', '')[:16]}  {r['job']:<8} {r.get('event', ''):<10} {verb}: {said}"
                   + (f" ({a.get('confidence')})" if a.get("confidence") is not None else "") + f"  |  then: {did}")
    cost = sum(r.get("cost", 0) for r in rows)
    out.append(f"{len(rows)} questions, ${cost:.2f}" if rows else "No dispatcher questions yet (LOOP_DISPATCHER=suggest or decide turns it on).")
    return "\n".join(out)
