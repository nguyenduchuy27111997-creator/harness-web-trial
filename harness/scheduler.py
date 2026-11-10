"""What runs next: the ready queue, milestones and their budgets, failures, answers, one tick. A mixin of loop.Loop."""

import fnmatch
import hashlib
import json
import re
import time

import integrity
from common import (  # noqa: F401
    backlog, git, health, lang, now, preview, DONE, GIT_LOCK, MIN_SESSION, Path, TRANSIENT, WAITING_HUMAN,
    WAIT_FOR_HUMAN,
)



def overlap(globs, files):
    """Whether a feature's `touches` globs and another job's files (or globs) share a file."""
    return any(f == g or fnmatch.fnmatch(f, g) or fnmatch.fnmatch(g, f) for g in globs for f in files)


class Scheduler:
    def check_milestones(self, wait=False):
        """Announce a milestone once all its features pass on main (the first look only records what is done)."""
        by_ms = {}
        for f in self.main.values():
            by_ms.setdefault(f.get("milestone"), []).append(f.get("status") == "passing")
        done = {ms for ms, ok in by_ms.items() if ms and all(ok)}
        if "milestones_done" not in self.state:
            self.state["milestones_done"] = sorted(done)
            return
        for ms in sorted(done - set(self.state["milestones_done"])):
            self.state["milestones_done"].append(ms)
            self.event(ms, f"milestone: {ms} done; run /release {ms} for staging and its owner check")
            self.push(f"milestone:{ms}", lang.say("Milestone {ms} done", ms=ms), lang.say("Every feature of {ms} is merged. Next: /release {ms}.", ms=ms),
                      wait=wait)

    # cost, failures, budgets --------------------------------------------------------------
    def milestone_of(self, job):
        fid = job.get("revert_of") or job["id"]
        return job.get("milestone") or self.main.get(fid, {}).get("milestone") if hasattr(self, "main") else None

    def budgets(self):
        f = self.home / "budgets.json"
        return json.loads(f.read_text()) if f.exists() else {}

    def over_budget(self, ms):
        cap = self.budgets().get(ms)
        return cap is not None and self.state["milestone_spent"].get(ms, 0) >= cap

    def failure(self, job, kind, detail=None):
        """Record a failure by kind; a kind seen twice or more (across runs) is a pattern to fix at its root.
        detail is what a rule job reads about this occurrence (the kind itself when not given)."""
        if job.get("kind") == "rule":
            return  # a failing rule job never spawns rules about rules
        detail = (detail or kind)[:600]
        kind = re.sub(r"\b[FBD]-?\d+\b|\bR-\S+", "<id>", kind)
        kind = re.sub(r"\S*[/\\]\S*|\S+\.(?:tsx?|jsx?|py|sql|md|json|css|png)\b", "<path>", kind)
        kind = re.sub(r"\d+", "<n>", kind).strip().lower()[:100]
        with (self.home / "failures.jsonl").open("a") as f:
            f.write(json.dumps({"at": now(), "id": job["id"], "kind": kind, "detail": detail}) + "\n")
        count = sum(1 for line in (self.home / "failures.jsonl").read_text().splitlines()
                    if json.loads(line)["kind"] == kind)
        if count >= 2:
            self.state["repeated"][kind] = count
            self.event(job["id"], f"repeated: {kind} x{count}")

    # backlog on main ----------------------------------------------------------------
    def refresh_main(self):
        with GIT_LOCK:
            git("fetch", "-q", "--prune", "origin", cwd=self.root)
            sha = git("rev-parse", "origin/main", cwd=self.root).stdout.strip()
            if git("status", "--porcelain", cwd=self.root).stdout.strip() == "":
                git("merge", "-q", "--ff-only", "origin/main", cwd=self.root, check=False)
        if sha != self.state.get("main_sha") or not hasattr(self, "main"):
            self.state["main_sha"] = sha
            self.main = {f["id"]: f for f in backlog.read(self.root, "origin/main")}
            self.overlay_touches()  # the dispatcher's, in decide mode
            docs = git("ls-tree", "--name-only", "origin/main", "docs/design/", cwd=self.root).stdout.split()
            self.designed = {Path(d).stem for d in docs if d.endswith(".md")}
        return sha

    def ready(self):
        """Features to build next, in order, each with the branch to build on."""
        if not hasattr(self, "main"):
            return []
        out = []
        todo = sorted(self.main.values(), key=lambda f: (f.get("type") != "bug", f["priority"]))
        # Only the first milestone still to design gets a job: a later design builds on the earlier one on main.
        for ms in list(dict.fromkeys(f.get("milestone") for f in todo if self.needs_design(f)))[:1]:
            job = self.job(f"D-{ms}")
            if (not job or job["stage"] == "queued") and not self.over_budget(ms):
                out.append(({"id": f"D-{ms}", "title": f"Design {ms}", "kind": "design", "milestone": ms}, "main"))
        # Each repeated failure kind gets one rule job, one at a time: they all edit the same two files,
        # so a second one built beside the first conflicts when the first merges.
        rule_busy = any(j.get("kind") == "rule" and j["stage"] not in DONE | WAITING_HUMAN | {"queued"}
                        for j in self.state["jobs"].values())
        for kind in self.state["repeated"]:
            rid = "L-" + hashlib.sha1(kind.encode()).hexdigest()[:6]
            job = self.job(rid)
            if not rule_busy and (not job or job["stage"] == "queued"):
                out.append(({"id": rid, "title": f"Rule: {kind}"[:70], "kind": "rule", "rule_for": kind}, "main"))
                break
        for f in todo:
            if self.opts.milestone and f.get("milestone") != self.opts.milestone:
                continue
            job = self.job(f["id"])
            if job and job["stage"] != "queued":
                continue
            if f["status"] == "passing":
                continue
            if f["status"] == "blocked" and not (job and job["stage"] == "queued"):
                continue
            if f.get("type") != "bug" and self.over_budget(f.get("milestone")):
                continue  # bugs still run; the rest of the milestone waits for a new budget
            if self.planning(f.get("milestone")):
                continue  # decide mode: the dispatcher's touches for the milestone come first
            base, ok = "main", True
            if self.needs_design(f):  # build on the milestone's design PR, never before it exists
                dj = self.job(f"D-{f.get('milestone')}")
                if dj and dj["stage"] in ("ci", "waiting_base", "merging"):
                    base = dj["branch"]
                else:
                    ok = False
            on_main = False
            for dep in f.get("depends_on", []):
                if self.main.get(dep, {}).get("status") == "passing":
                    on_main = True
                    continue
                dj = self.job(dep)
                if dj and dj["stage"] in ("review", "fixing", "ci", "waiting_base", "merging") and base == "main":
                    if self.stale_base(f, dj):
                        ok = False
                    else:
                        base = dj["branch"]  # stack on the open PR
                else:
                    ok = False
            if ok and on_main and base != "main" and git(
                    "merge-base", "--is-ancestor", "origin/main", f"origin/{base}", cwd=self.root, check=False).returncode:
                ok = False  # a dependency that merged since that PR branched off is not on it: wait for its rebase
            if ok and base == "main" and f.get("touches"):
                ok, base = self.lease(f)
            if ok:
                out.append((f, base))
        return out

    # leases: one writer per file (DESIGN.md 15.5, P29) ----------------------------------
    def footprint(self, job):
        """The files an open job holds: what its feature says it touches, and what its branch has changed."""
        files = set(self.main.get(job["id"], {}).get("touches", []))
        wt = job.get("worktree")
        if job["stage"] != "building" and wt and Path(wt).exists():
            head = git("rev-parse", "HEAD", cwd=wt, check=False).stdout.strip()
            if (job.get("footprint") or [None])[0] != head:  # read once per commit
                changed = git("diff", "--name-only", f"{job.get('base_sha') or 'origin/main'}...HEAD", cwd=wt,
                              check=False).stdout.split()
                job["footprint"] = [head, changed]
            files |= set(job["footprint"][1])
        return files

    def lease(self, f):
        """(ok, base) for a feature that says which files it touches: free, it builds on main; held by one open PR,
        it stacks on that PR's branch; held by a lane still building, or by two PRs, it waits."""
        # A feature that depends on this one waits for it: building on it would stack each on the other.
        # Seen in the web trial: F048 was rebuilt on F049's PR, and F049's PR waited for F048 to merge.
        after = self.dependents(f["id"])
        holders = [j for j in self.state["jobs"].values() if j["id"] != f["id"] and j["id"] not in after
                   and not j.get("kind") and j["stage"] in ("building", "review", "fixing", "ci", "waiting_base", "merging")
                   and overlap(f["touches"], self.footprint(j))]
        if not holders:
            return True, "main"
        if len(holders) == 1 and holders[0]["stage"] != "building":
            return (False, "main") if self.stale_base(f, holders[0]) else (True, holders[0]["branch"])
        self.wait(f, f"{', '.join(j['id'] for j in holders)} holds files it touches")
        return False, "main"

    def wait(self, f, why):
        if self.state.setdefault("lease_waits", {}).get(f["id"]) != why:
            self.state["lease_waits"][f["id"]] = why
            self.event(f["id"], f"waits: {why}")

    def dependents(self, fid):
        """The features that depend on fid, directly or through others."""
        out, todo = set(), [fid]
        while todo:
            cur = todo.pop()
            for other in self.main.values():
                if cur in other.get("depends_on", []) and other["id"] not in out:
                    out.add(other["id"])
                    todo.append(other["id"])
        return out

    def stale_base(self, f, j):
        """Whether j's PR branch has older protected harness files than main (a kit upgrade since it branched).
        A feature built on it would roll them back, and the integrity guard refuses that. Seen in the web trial:
        F048 rebuilt on F049's branch from kit 5.27.6 was refused for integrity.py, scheduler.py and check.sh."""
        names = git("diff", "--name-only", "origin/main", f"origin/{j['branch']}", cwd=self.root, check=False).stdout.split()
        if any(integrity.PROTECTED.match(p) for p in names):
            self.wait(f, f"{j['id']}'s branch has older harness files than main")
            return True
        return False

    def needs_design(self, f):
        return (f.get("type") != "bug" and f.get("status") != "passing" and f.get("milestone")
                and f["milestone"] not in self.designed
                and not (self.opts.milestone and f["milestone"] != self.opts.milestone))

    # lanes ---------------------------------------------------------------------------
    def lanes_busy(self):
        # A lane is free only once its result is collected: a finished but uncollected
        # session still holds its lane and its cost has not been counted yet.
        return len(self.threads) + len(getattr(self, "twins", ()))  # a best-of-2's second build holds a lane too

    def apply_answers(self):
        for path in sorted(self.home.glob("answer-*.json")):
            a = json.loads(path.read_text())
            path.unlink()
            job = self.job(a["id"])
            if job and a.get("drop"):
                job["question"] = None
                self.set_stage(job, "dropped", note=a["text"])
                orig = self.job(job.get("revert_of") or "")
                if orig and orig["stage"] == "reverted":  # the revert never landed: the feature is still on main
                    orig["question"] = None
                    self.set_stage(orig, "merged", note=f"kept on main: the revert was dropped ({a['text']})")
                continue
            if job and job.get("revert_of") and job["stage"] == "held":
                # The human fixed what blocked the revert: put it on the current main and let CI run again.
                job.setdefault("answers", []).append(a["text"])
                job["question"] = None
                with GIT_LOCK:
                    git("fetch", "-q", "origin", cwd=job["worktree"])
                if self.rebase(job, "origin/main"):
                    self.set_stage(job, "ci", note="answered; revert rebased on main, CI again")
            elif job and job["stage"] == "held" and job.get("budget_held"):
                more = re.search(r"\$?\s*(\d+(?:\.\d+)?)\s*(?:\$|dollars?|usd)?\s*more", a["text"], re.I)
                job["budget_extra"] = job.get("budget_extra", 0) + (float(more.group(1)) if more else 5.0)
                stage, job["question"] = job.pop("budget_held"), None
                if stage == "fixing":
                    self.set_stage(job, "fixing", note=f"budget +${job['budget_extra']:.2f}; fixing")
                    self.launch(job, self.work_fix)
                else:
                    self.set_stage(job, "queued" if stage == "building" else stage,
                                   note=f"budget +${job['budget_extra']:.2f}; going on")
            elif job and job["stage"] == "held" and job.get("pr"):
                # Its PR is open with committed work: fix the branch with the answer, never rebuild it.
                if self.lanes_busy() >= self.lane_limit() or not self.can_start() or self.paused():
                    path.write_text(json.dumps(a))  # no lane or budget yet: apply it on a later tick
                    continue
                job.setdefault("answers", []).append(a["text"])
                job["fix_rounds"] = job["review_failures"] = 0  # the answer earns the usual two rounds
                job["bug_counts"], job["bug_seen"] = [], {}  # and progress is judged afresh from it
                job["answered"] = True
                self.start_fix(job, f"{job.get('question') or 'The PR was held.'}\n\nThe human answered: {a['text']}")
            elif job and job["stage"] in WAITING_HUMAN:
                job.setdefault("answers", []).append(a["text"])
                job["attempts"], job["question"] = 0, None
                self.set_stage(job, "queued", note="answered; building again")

    def collect(self):
        for fid, (t, holder, stage) in list(self.threads.items()):
            if t.is_alive():
                continue
            del self.threads[fid]
            job, res = self.job(fid), holder.get("result", {})
            self.count(job, holder, stage)
            q = self.quality_path(fid)
            if q.exists():  # the last green check of the session: coverage, tests, bundle (harness/quality.py)
                try:
                    job["quality"] = json.loads(q.read_text())
                except ValueError:
                    pass
            if job["stage"] in DONE:  # dropped while the session ran; seen for real: its result would bring it back
                self.event(fid, f"the {stage} session ended after the job was {job['stage']}; its result is not used")
                continue
            if res.get("subtype") in ("limit", "infra", "auth"):
                self.pause(job, stage, kind=res["subtype"])
                continue
            self.state.pop("infra_since", None)  # a session got through: the API is back
            self.state.pop("auth_since", None)
            self.state["infra_pauses"] = 0
            try:
                {"building": self.finish_build, "review": self.finish_review, "fixing": self.finish_fix}[stage](job, res)
            except Exception as e:
                if TRANSIENT.search(str(e)):  # keep the session's work and finish it on a later tick
                    self.threads[fid] = (t, holder, stage)
                    if not holder.get("offline"):
                        holder["offline"] = True
                        self.event(fid, f"network error, will retry: {str(e)[:160]}")
                    continue
                self.set_stage(job, "held", note=f"loop error: {e}", question=f"{fid}: the loop hit an error: {e}")

    def tick(self):
        was, self.busy = self.busy, self.machine_busy()
        if self.busy and not was:
            self.event("loop", f"waiting: {self.busy}; no new session until it eases (CI and merges go on)")
        elif was and not self.busy:
            self.event("loop", "the machine can take sessions again")
        preview.PREVIEW.tick(self.busy)
        self.poll_comments()
        self.apply_answers()
        self.collect()
        self.collect_advice()
        self.refresh_main()
        self.check_milestones()
        for job in list(self.state["jobs"].values()):
            try:
                if job["stage"] == "ci":
                    self.advance_ci(job)
                elif job["stage"] == "merging":
                    self.advance_merge(job)
                elif job["stage"] == "waiting_base":
                    self.advance_waiting(job)
            except Exception as e:
                if TRANSIENT.search(str(e)):
                    raise  # the network, not the job: the whole tick is retried
                self.set_stage(job, "held", note=f"loop error: {e}", question=f"{job['id']}: the loop hit an error: {e}")
        self.watch_main()
        self.flush_questions()
        self.watch_runner()
        self.alerts()
        self.keep_history()
        self.delete_merged_branches()
        for ms, cap in self.budgets().items():
            if self.over_budget(ms) and not self.state["milestone_over"].get(ms):
                self.state["milestone_over"][ms] = True
                self.event(ms, f"budget: {ms} used ${self.state['milestone_spent'].get(ms, 0):.2f} of ${cap}; "
                               f"its features wait for a new budget (loop.py budget {ms} <dollars>)")
                self.push(f"msbudget:{ms}:{cap}", lang.say("{ms} budget used", ms=ms),
                          lang.say("{ms} spent ${spent} of ${cap}; its features wait for more.", ms=ms,
                                   spent=f"{self.state['milestone_spent'].get(ms, 0):.2f}", cap=cap))
            elif not self.over_budget(ms):
                self.state["milestone_over"].pop(ms, None)
        if (self.home / "stop").exists():
            (self.home / "stop").unlink()
            self.stopping, self.state["stop_reason"] = True, "stopped by you"
        # Lane work: reviews first (they unblock merges), then new builds. Neither starts once the
        # budget is used or held by running sessions: a session capped at nothing ends without a result.
        # Waiting reviews resume next run.
        paused = self.paused()  # Claude's usage limit: CI and merges go on, Claude work waits for the reset
        for job in self.state["jobs"].values():
            if self.lanes_busy() >= self.lane_limit() or not self.can_start() or paused:
                break
            if job["stage"] == "review" and job["id"] not in self.threads:
                if job.get("fix_waiting"):
                    self.start_fix(job, job.pop("fix_waiting"))
                else:
                    self.start_review(job)
        if self.low_budget() and not self.state["stop_reason"]:
            self.state["stop_reason"] = (f"budget ${self.state['budget']} used" if self.state["budget"] - self.state["spent"] < 0.01
                                         else f"budget ${self.state['budget']} used (less than ${MIN_SESSION:.2f} left, too little "
                                              "to start a session)")
            self.push(f"budget:{self.state['started']}", lang.say("Budget used"),
                      lang.say("Spent ${spent} of ${budget}; work in flight finishes, nothing new starts.",
                               spent=f"{self.state['spent']:.2f}", budget=self.state["budget"]))
        if not self.stopping and not paused and not self.state["ci_blocked"] and not self.state.get("ci_stalled"):
            # nothing new while CI cannot run
            for f, base in self.ready():
                if self.lanes_busy() >= self.lane_limit() or not self.can_start():
                    break
                if base == "main" and f.get("touches"):  # a build started earlier in this tick may hold its files now
                    ok, base = self.lease(f)
                    if not ok:
                        continue
                self.start_build(f, base)
        self.state["health"] = health.snapshot(self.state, self.root)
        self.state["last_tick"] = now()
        self.save()

    def base_waits_on_human(self, job, seen=()):
        """True when the job's base PR cannot move without a human: it is held, it is back in the queue and
        this run has no budget left (or is stopping) to build it, it waits for a review or fix session the
        spent budget cannot start, or it waits in turn on a base like that."""
        stuck = WAITING_HUMAN | ({"queued"} if self.stopping or self.low_budget() else set())
        broke = self.low_budget()
        for j in self.state["jobs"].values():
            if j.get("branch") != job["base"] or j["id"] in seen:
                continue
            if (j["stage"] in stuck
                    or broke and j["stage"] == "review" and j["id"] not in self.threads
                    or broke and j["stage"] == "ci" and j.get("fix_waits")
                    or j["stage"] == "waiting_base" and self.base_waits_on_human(j, (*seen, job["id"]))):
                return True
        return False

    def finished(self):
        if self.state.get("stop_now"):  # given up waiting for the network or the API
            return True
        revert = self.job(self.state.get("main_red_by") or "")
        parked = self.state["main_red"] and revert and revert["stage"] in WAITING_HUMAN
        broke = self.low_budget()
        active = [j for j in self.state["jobs"].values() if j["stage"] not in DONE | WAITING_HUMAN | {"queued"}
                  and not (parked and j["stage"] == "merging")  # cannot merge until a human fixes main
                  and not (broke and j["stage"] == "review" and j["id"] not in self.threads)  # next run reviews it
                  and not (broke and j["stage"] == "ci" and j.get("fix_waits"))  # next run fixes it
                  and not (j["stage"] == "waiting_base" and self.base_waits_on_human(j))  # moves once a human answers
                  or (j["stage"] == "merged" and not j.get("main_checked"))]
        if parked and not active and not self.threads and not self.state["stop_reason"]:
            self.state["stop_reason"] = f"main CI is red and the revert of {revert.get('revert_of')} needs you"
        if self.state["ci_blocked"] and not self.threads and all(
                j["stage"] in ("ci", "merged") for j in active):
            self.state["stop_reason"] = ("GitHub Actions is not starting jobs (check Billing & plans: spending limit or "
                                         "payment); start the loop again once CI runs")
            return True
        if self.state.get("ci_stalled") and not self.threads and all(
                j["stage"] in ("ci", "merging", "merged") for j in active):
            self.state["stop_reason"] = f"the CI runner is stuck ({self.state['ci_stalled']}); start the loop again once it runs"
            return True
        if active or self.threads or getattr(self, "advice", None):  # the dispatcher's answer is written before the end
            self.state.pop("idle_since", None)
            self.state.pop("idle_said", None)
            return False
        if self.stopping or broke:
            return True
        self.refresh_main()  # a merge this tick is not in the backlog read before it: its dependents are ready now
        if self.ready() or (self.state.get("paused_until") and any(j["stage"] == "review" for j in self.state["jobs"].values())):
            return False  # work waits for the usage limit to reset
        if any(self.home.glob("answer-*.json")):
            return False  # an answer waits for a lane, budget or a quiet machine; seen for real: the loop stopped at load 28
        asked = [j["id"] for j in self.state["jobs"].values() if j["stage"] in WAITING_HUMAN]
        if asked and WAIT_FOR_HUMAN and not self.state["stop_reason"]:
            since = self.state.setdefault("idle_since", time.time())
            if time.time() - since < WAIT_FOR_HUMAN:
                if not self.state.get("idle_said"):
                    self.state["idle_said"] = True
                    self.event("loop", f"waiting on you: {', '.join(asked)}; the loop stays up for your answer, "
                                       f"on the PR or with loop.py answer, for {WAIT_FOR_HUMAN / 3600:.0f} h")
                return False
        self.state.pop("idle_said", None)
        if not self.state["stop_reason"]:
            waiting = [j["id"] for j in self.state["jobs"].values() if j["stage"] in WAITING_HUMAN]
            waiting += [f"{ms} budget" for ms in self.state["milestone_over"]]
            self.state["stop_reason"] = ("no ready features left" + (f"; waiting on you: {', '.join(waiting)}" if waiting else ""))
        return True
