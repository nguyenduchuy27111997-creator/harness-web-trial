"""The dispatcher (DESIGN.md 15.4, P31): the loop asks an opus agent for its judgement when a feature fails, a PR
is held, main goes red or a milestone starts. Suggest mode only: its advice goes to <home>/decisions.jsonl beside
what really happened next, and `loop.py decisions` shows them side by side, so the owner can judge it over a
milestone before it may decide anything. A mixin of loop.Loop."""

import json
import os
import re
import threading
import time
from pathlib import Path

from common import backlog, now, WAITING_HUMAN

MODE = os.environ.get("LOOP_DISPATCHER", "")  # "suggest" turns it on
CAP = float(os.environ.get("LOOP_DISPATCHER_CAP", "0.5"))  # dollars at most per question
EVENTS = {"held": "held", "failed": "failed", "reverted": "main red", "needs_human": "needs human"}


class Dispatcher:
    def consult(self, job, stage):
        """Ask the dispatcher about this job's new stage, in the background, once per situation."""
        event = "milestone" if stage == "building" and job.get("kind") == "design" else EVENTS.get(stage)
        # Not held back by a busy machine: it is one read-only call, and a busy machine is when PRs get held. Seen on
        # the web trial: at load 70-90 on 12 CPUs, F040 and F044 were held and the dispatcher was never asked.
        if (MODE != "suggest" or not event or job.get("kind") == "rule" or self.free_budget() < CAP
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
        t.start()

    def brief(self, job, event):
        f = self.main.get(job["id"], {}) if hasattr(self, "main") else {}
        lines = (self.home / "events.log").read_text().splitlines() if (self.home / "events.log").exists() else []
        mine = [x for x in lines if f"  {job['id']} " in x][-25:]
        if event == "milestone":
            ms = job.get("milestone")
            feats = [{k: x.get(k) for k in ("id", "title", "complexity", "depends_on", "acceptance", "touches") if x.get(k)}
                     for x in backlog.read(self.root, "origin/main") if x.get("milestone") == ms and x.get("status") != "passing"]
            return (f"Event: milestone {ms} starts; its design is being written (docs/design/{ms}.md on branch "
                    f"{job.get('branch')}, if it is there yet). Its features still to build:\n"
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
                self.consult(job, "building" if event == "milestone" else job["stage"])
                continue
            tries.pop(key, None)
            self.decide_log({"key": key, "at": now(), "job": fid, "event": event, "advice": advice,
                             "cost": round(cost, 4), **({"error": box["error"]} if "error" in box else {})})
            if job is not None and event != "milestone":
                job["advice"] = key  # what happens to the job next is written beside it (outcome)
            what = advice.get("action") or ("touches for " + ", ".join(advice["touches"]) if advice.get("touches") else "no advice")
            self.event(fid, f"dispatcher would: {what}" + (f" ({advice['why'][:160]})" if advice.get("why") else ""))

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


def report(home):
    """Each question, the dispatcher's advice and what really happened, newest last."""
    f = Path(home) / "decisions.jsonl"
    rows = [json.loads(x) for x in f.read_text().splitlines() if x.strip()] if f.exists() else []
    by = {}
    for r in rows:
        by.setdefault(r["key"], {}).update(r)
    out = []
    for r in by.values():
        a = r.get("advice", {})
        said = a.get("action") or (f"touches for {len(a['touches'])} features" if a.get("touches") else a.get("raw", "")[:80])
        did = r.get("actual")
        did = (f"{did['stage']}" + (f", owner said: {did['answer'][:80]}" if did.get("answer") else "")) if did else "still waiting"
        out.append(f"{r.get('at', '')[:16]}  {r['job']:<8} {r.get('event', ''):<10} would: {said}"
                   + (f" ({a.get('confidence')})" if a.get("confidence") is not None else "") + f"  |  then: {did}")
    cost = sum(r.get("cost", 0) for r in rows)
    out.append(f"{len(by)} questions, ${cost:.2f}" if by else "No dispatcher questions yet (LOOP_DISPATCHER=suggest turns it on).")
    return "\n".join(out)
