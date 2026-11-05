"""The stages a feature goes through before CI: build, design, rule, review and fix. A mixin of loop.Loop."""

import json
import sys
import time

from common import (  # noqa: F401
    backlog, gh, git, now, run, DOCS, GIT_LOCK, NOT_SENSITIVE, Path, REVIEW_LINE, SENSITIVE,
)


class Stages:
    # stage: building ----------------------------------------------------------------
    def start_build(self, f, base):
        fid = f["id"]
        job = self.job(fid) or {"id": fid, "attempts": 0, "fix_rounds": 0, "cost": 0.0, "answers": []}
        if f.get("kind") == "design":
            job.update(kind="design", milestone=f["milestone"])
        elif f.get("kind") == "rule":
            job.update(kind="rule", rule_for=f["rule_for"])
        job.setdefault("first_started", time.time())
        branch = {"design": f"agent/design-{job.get('milestone')}", "rule": f"agent/rule-{fid[2:]}"}.get(job.get("kind"), f"agent/{fid}")
        job.update(title=f["title"], branch=branch, base=base, worktree=str(self.trees / fid),
                   fix_rounds=0, pr=None, pr_url=None, started=now(), port=None, note=None, question=None,
                   merge_sha=None, main_checked=False, findings="")
        self.state["jobs"][fid] = job
        with GIT_LOCK:
            self.remove_worktree(job)
            git("fetch", "-q", "origin", cwd=self.root)  # a merge earlier in this tick moved main
            start = "origin/main" if base == "main" else base
            git("worktree", "add", "-q", "-B", job["branch"], job["worktree"], start, cwd=self.root)
            job["base_sha"] = git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()
        job["model"] = self.model_for(job)
        self.set_stage(job, "building", note=f"on {base} with {job['model']}")
        self.launch(job, self.work_build)

    def work_build(self, job):
        extra = " ".join(job.get("answers", []))
        kind = job.get("kind")
        command = (f"/design {job['milestone']}" if kind == "design" else self.rule_prompt(job) if kind == "rule"
                   else f"/next {job['id']}")
        prompt = command + (f" The human answered earlier questions: {extra}" if extra else "")
        if job.get("last_failure"):  # a retry knows why the last attempt failed, so it does not repeat it blind
            prompt += f" The previous attempt failed: {job['last_failure']}"
        cost, subtype, text = self.claude(job, prompt, job["model"])
        return {"cost": cost, "subtype": subtype, "text": text}

    def finish_build(self, job, res):
        wt = job["worktree"]
        if res.get("subtype") in ("no-json", "timeout") or res.get("error"):
            return self.retry(job, res.get("error") or ("the session ran over the time limit"
                                                        if res.get("subtype") == "timeout" else "Claude returned no result"))
        if self.starved(job, res):  # not the feature's fault: build it again with a full budget, no attempt used
            return self.set_stage(job, "queued", note=f"cut off by the run's budget (${job['last_cap']}); builds again")
        if git("status", "--porcelain", cwd=wt).stdout.strip():
            proof = Path(wt) / f"harness/evidence/design-{job.get('milestone')}.md"
            rejected = job.get("kind") == "design" and proof.exists() and "VERDICT: FAIL" in proof.read_text()
            why = ("the architect still failed the design after 3 rounds: "
                   + proof.read_text().split("PROBLEMS:", 1)[-1].strip()[:1500]) if rejected else \
                "the session left uncommitted work (stashed)"
            git("stash", "push", "-q", "-u", "-m", f"loop: uncommitted work from {job['id']}", cwd=wt)
            # A feature that committed "needs a human" and left a stray file (a screenshot, say) still needs one:
            # building it again would hit the same wall. Seen for real in a sandboxed web run.
            f = {} if job.get("kind") else next((x for x in backlog.read(wt) if x["id"] == job["id"]), {})
            if f.get("status") == "blocked" and f.get("blocked_reason") == "needs_human":
                return self.set_stage(job, "needs_human", note="needs you", question=f.get("notes") or "needs a decision")
            return self.retry(job, why)
        guard = run(["git", "show", f"{job['base_sha']}:harness/integrity.py"], cwd=wt).stdout or \
            (Path(wt) / "harness/integrity.py").read_text()
        check = self.guard(job, guard, job["base_sha"])
        if check.returncode != 0:
            git("update-ref", f"refs/harness/rejected/{job['id']}-{int(time.time())}", "HEAD", cwd=wt)
            git("reset", "-q", "--hard", job["base_sha"], cwd=wt)
            lines = check.stdout.strip().splitlines()
            protected = [ln.split(": ", 2)[1] for ln in lines if "a protected harness file" in ln]
            if protected and len(protected) == len(lines):  # not a mistake to retry: only a human changes these
                return self.set_stage(job, "needs_human", note="changed protected harness files",
                                      question=f"{job['id']} changed protected harness files ({', '.join(protected)}), "
                                               "which an agent may not. Answer how to build it without them, or change "
                                               "them yourself in a chat session first, then answer to build it again.")
            return self.retry(job, "integrity guard: " + lines[0])
        if job.get("kind") == "design":
            return self.finish_design(job, res)
        if job.get("kind") == "rule":
            return self.finish_rule(job, res)
        status = backlog.read(wt)
        f = next((x for x in status if x["id"] == job["id"]), {})
        if f.get("status") == "passing":
            shots = Path(wt) / f"harness/evidence/{job['id']}"
            job["shots"] = sorted(x.name for x in shots.glob("*.png")) if shots.is_dir() else []
            if not self.ensure_base(job):
                return
            self.open_pr(job)
            return self.set_stage(job, "review")
        if f.get("status") == "blocked" and f.get("blocked_reason") == "needs_human":
            return self.set_stage(job, "needs_human", note="needs you", question=f.get("notes") or "needs a decision")
        return self.retry(job, f.get("notes") or f"ended {f.get('status', 'unknown')}")

    def guard(self, job, source, base):
        """Run the integrity guard (the base commit's own copy, given as source) on the branch."""
        flags = ["--agent", *(["--rule"] if job.get("kind") == "rule" else [])]
        check = run([sys.executable, "-", "--base", base, "--head", "HEAD", *flags], cwd=job["worktree"], input=source)
        if "unrecognized arguments: --agent" in check.stderr:  # a base from before kit 5.0
            check = run([sys.executable, "-", "--base", base, "--head", "HEAD", *flags[1:]], cwd=job["worktree"],
                        input=source)
        return check

    def finish_design(self, job, res):
        doc = f"docs/design/{job['milestone']}.md"
        if git("diff", "--quiet", job["base_sha"], "HEAD", "--", doc, cwd=job["worktree"], check=False).returncode == 0:
            last = (res.get("text") or "").strip().splitlines()[-1:] or ["no design doc committed"]
            return self.retry(job, last[0][:300])
        self.open_pr(job)  # the integrity guard passed, so the architect approved this exact doc
        self.set_stage(job, "ci", note="architect: PASS")

    def rule_prompt(self, job):
        f = self.home / "failures.jsonl"
        seen = [json.loads(x) for x in (f.read_text().splitlines() if f.exists() else [])]
        examples = "\n".join(f"- {x['id']} ({x['at']}): {x.get('detail', x['kind'])}"
                              for x in seen if x["kind"] == job["rule_for"])[-3000:]
        return (f"/learn The build loop saw the same kind of failure again and again: \"{job['rule_for']}\". "
                f"Occurrences:\n{examples}\n(This is the loop: follow the skill's section for it.)")

    def finish_rule(self, job, res):
        if git("diff", "--quiet", job["base_sha"], "HEAD", cwd=job["worktree"], check=False).returncode == 0:
            text = (res.get("text") or "").strip()
            if "PROPOSE:" in text:  # needs more than a rule: a lint, hook or gate is the human's call
                return self.set_stage(job, "needs_human", note="proposes a harness change",
                                      question=f"Repeated failure \"{job['rule_for']}\": " + text.split("PROPOSE:", 1)[1].strip()[:800])
            return self.retry(job, (text.splitlines()[-1:] or ["no rule committed"])[0][:300])
        self.open_pr(job)  # the guard (--rule) allowed only the rule files
        self.set_stage(job, "ci", note="rule PR")

    def retry(self, job, why):
        self.failure(job, why)
        job["last_failure"] = why
        job["attempts"] = job.get("attempts", 0) + 1
        if job["attempts"] <= self.opts.retries:
            return self.set_stage(job, "queued", note=f"attempt {job['attempts']} failed: {why}; retrying")
        return self.set_stage(job, "failed", note=why,
                              question=f"{job['id']} failed {job['attempts']} times: {why}. How should it be done?")

    # PRs -------------------------------------------------------------------------------
    def repo(self):
        if "repo" not in self.state:
            self.state["repo"] = gh("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner",
                                    cwd=self.root).stdout.strip()
        return self.state["repo"]

    def pr_body(self, job, findings=""):
        wt, fid = Path(job["worktree"]), job["id"]
        if job.get("kind") == "rule":
            diff = git("diff", job["base_sha"], "HEAD", cwd=str(wt)).stdout[:4000]
            return (f"The same kind of failure kept happening: **{job['rule_for']}**. This PR adds a rule for it.\n\n"
                    f"```diff\n{diff}\n```\n\n---\nOpened by the harness loop from a repeated failure. It may change only "
                    "`docs/golden-principles.md` and the reviewer's checklist (CI enforces this), and merges once CI is green.\n")
        if job.get("kind") == "design":
            ms = job["milestone"]
            proof = wt / f"harness/evidence/design-{ms}.md"
            verdict = proof.read_text()[:3000] if proof.exists() else ""
            return (f"Design for milestone **{ms}**: [`docs/design/{ms}.md`](https://github.com/{self.repo()}/blob/"
                    f"{job['branch']}/docs/design/{ms}.md)\n\n### Architect\n{verdict}\n\n---\nBuilt by the harness loop. "
                    f"The milestone's features build on this branch; it merges once CI is green.\n")
        f = self.main.get(fid, {})
        evidence = (wt / f"harness/evidence/{fid}.md").read_text() if (wt / f"harness/evidence/{fid}.md").exists() else ""
        verdict = "\n".join(line for line in evidence.splitlines() if line.startswith(("VERDICT", "- ")))[:2500]
        shots = sorted((wt / f"harness/evidence/{fid}").glob("*.png"), key=lambda x: ("mobile" not in x.stem, x.name)) \
            if (wt / f"harness/evidence/{fid}").exists() else []  # the owner reads these on a phone
        images = "\n".join(f"![{s.stem}](https://github.com/{self.repo()}/blob/{job['branch']}/harness/evidence/{fid}/{s.name}?raw=true)"
                           for s in shots)
        steps = "\n".join(f"- {a}" for a in f.get("acceptance", []))
        return (f"Feature **{fid}**: {f.get('title', '')}\n\n### Acceptance\n{steps}\n\n### Verifier\n{verdict}\n\n{images}\n\n"
                + (f"### Review\n{findings}\n\n" if findings else "")
                + "---\nBuilt by the harness loop. It merges this PR itself (squash) once CI is green, the verifier "
                  "passed and review found no bugs.\n")

    def open_pr(self, job):
        with GIT_LOCK:
            git("push", "-q", "-f", "-u", "origin", job["branch"], cwd=job["worktree"])
        body = self.home / f"pr-{job['id']}.md"
        body.write_text(self.pr_body(job))
        existing = gh("pr", "list", "--head", job["branch"], "--state", "open", "--json", "number,url", cwd=self.root).stdout
        prs = json.loads(existing or "[]")
        if prs:
            job["pr"], job["pr_url"] = prs[0]["number"], prs[0]["url"]
            gh("pr", "edit", str(job["pr"]), "--base", job["base"], "--body-file", str(body), cwd=self.root)
        else:
            url = gh("pr", "create", "--base", job["base"], "--head", job["branch"],
                     "--title", f"{job['id']}: {job['title']}", "--body-file", str(body), cwd=self.root).stdout.strip()
            job["pr"], job["pr_url"] = int(url.rstrip("/").rsplit("/", 1)[-1]), url

    # stage: review and fixing -----------------------------------------------------------
    def start_review(self, job):
        self.set_stage(job, "review", note=job.get("note"))
        self.launch(job, self.work_review)

    def work_review(self, job):
        # A stacked job is reviewed against the commit it was built on: its base branch may have been
        # rebased since (seen for real: F003's diff against a rebased agent/F001 held all of F001, 42 files).
        base = "origin/main" if job["base"] == "main" else job.get("base_sha") or job["base"]
        ms = self.main.get(job["id"], {}).get("milestone")
        design = f"docs/design/{ms}.md"
        also = (f" The milestone's design is {design}: tell the reviewer to check the diff against it."
                if ms and (Path(job["worktree"]) / design).exists() else "")
        head = git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()
        seen = job.get("reviewed_head")
        # After a fix, only what the fix changed is reviewed, against the bugs it was asked to fix. A
        # conflict resolution (main merged in) or a rebase since gets a full review again.
        delta = (seen and job.get("fix_rounds") and not job.pop("full_review", False)
                 and git("merge-base", "--is-ancestor", seen, "HEAD", cwd=job["worktree"], check=False).returncode == 0)
        span = f"{seen}..HEAD" if delta else f"{base}...HEAD"
        job["reviewed_head"] = head
        changed = git("diff", "--name-only", span, cwd=job["worktree"]).stdout.split()
        baselines = [p for p in changed if p.startswith("e2e/__screenshots__/") and p.endswith(".png")]
        pictures = [p for p in changed if p.endswith(".png")]
        docs_only = changed and all(DOCS.search(p) for p in changed)
        if not docs_only and any(SENSITIVE.search(p) and not NOT_SENSITIVE.search(p) for p in changed):
            also += " Also spawn the security-reviewer subagent on the same diff."
        if not docs_only and (pictures if delta else (job.get("shots") or baselines)):  # the designer judges what users see
            also += (f" Also spawn the designer subagent on feature {job['id']} with base {base}"
                     + (f" and these changed baselines: {', '.join(baselines)}" if baselines else "")
                     + (f" (a stacked PR: UI that {job['base']} already has is the base PR's, not this feature's)"
                        if base != "origin/main" else "")
                     + ".")
        also += (" Run every subagent named here in the foreground (not in the background) and wait for all of them."
                 if also else "")
        fixed = (f" This is a re-review after a fix: the diff is only the fix. Ask the reviewer to check that it fixes "
                 f"these findings and adds no new bug:\n{job.get('last_bugs', '')}\n" if delta else "")
        prompt = (f"Spawn the reviewer subagent on `git diff {span}`.{fixed}{also} Do not edit or commit anything. "
                  "Reply with only their finding lines, most severe first, or exactly: No findings.")
        cost, subtype, text = self.claude(job, prompt, self.opts.model, turns=60, lane_note=False)
        return {"cost": cost, "subtype": subtype, "findings": text.strip()}

    def finish_review(self, job, res):
        if self.base_merged(job):  # the base PR merged while this review ran: move onto main
            self.restack(job)
            if job["base"] != "main":
                return  # the rebase failed and the feature builds again
            # A clean rebase leaves the PR's own changes as they were, so the review still holds.
        text = res.get("findings", "")
        reported = "No findings" in text or REVIEW_LINE.search(text)
        if res.get("subtype") != "success" or not reported:
            # Cut off (budget, turns), crashed, or ended its turn before its subagents reported (seen for real:
            # "All three subagents are running ... I'm waiting" was read as no bugs): it reviewed nothing.
            if res.get("subtype") == "success":
                res["subtype"] = "no findings reported"
            job["review_failures"] = job.get("review_failures", 0) + 1
            if job["review_failures"] >= 2:
                return self.set_stage(job, "held", note=f"review did not finish ({res.get('subtype')})",
                                      question=f"{job['id']}: the review session did not finish twice "
                                               f"({res.get('subtype')}); the PR stays open. Review it, or answer and the loop fixes the "
                                               "branch with your answer and reviews it again.")
            return self.set_stage(job, "review", note=f"review did not finish ({res.get('subtype')}); again")
        findings = res.get("findings", "")
        job["findings"] = findings
        bugs = [line for line in findings.splitlines() if "[bug]" in line]
        kinds = {}  # one occurrence per kind per review, however many lines it has
        for line in bugs:
            kind = ("security" if "security:" in line else "design doc" if "docs/design" in line
                    else "ui (designer)" if ".png" in line.split("[bug]")[0] else "code")
            kinds.setdefault(kind, []).append(line.strip())
        for kind, lines in kinds.items():
            self.failure(job, f"review bug: {kind}", detail="\n".join(lines))
        job["last_bugs"] = "\n".join(bugs)
        if not bugs:
            with GIT_LOCK:  # CI and the merge must see what was reviewed (a restart can leave a fix unpushed)
                git("push", "-q", "-f", "origin", job["branch"], cwd=job["worktree"])
            return self.set_stage(job, "ci", note="review: no bugs")
        if job["fix_rounds"] >= 2:
            return self.set_stage(job, "held", note="review still finds bugs after 2 fixes",
                                  question=f"{job['id']}: review still finds bugs after 2 fix rounds:\n" + "\n".join(bugs))
        if not self.can_start():  # the fix starts from these findings once it can: the review is not paid for twice
            job["fix_waiting"] = "The reviewer found these bugs:\n" + "\n".join(bugs)
            return self.set_stage(job, "review", note="the fix waits for " + ("a less busy machine" if self.busy
                                                                               else "budget"))
        return self.start_fix(job, "The reviewer found these bugs:\n" + "\n".join(bugs))

    def start_fix(self, job, problems, count=True):
        job["fix_rounds"] += 1 if count else 0
        job["fix_from_human"] = job.pop("answered", False)
        job["fix_with"] = problems
        job["fix_base"] = git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()
        self.set_stage(job, "fixing", note=f"round {job['fix_rounds']}")
        self.launch(job, self.work_fix)

    def work_fix(self, job):
        if job.get("kind") == "rule":
            prompt = (f"You are continuing a rule PR for the repeated failure \"{job['rule_for']}\" on this branch. Fix only "
                      f"these problems:\n{job['fix_with']}\n\nChange only docs/golden-principles.md and "
                      ".claude/agents/reviewer.md, run ./scripts/check.sh, and commit.")
            cost, subtype, _ = self.claude(job, prompt, self.opts.large_model)
            return {"cost": cost, "subtype": subtype}
        if job.get("kind") == "design":
            prompt = (f"You are continuing the design of milestone {job['milestone']} on this branch. Fix only these "
                      f"problems:\n{job['fix_with']}\n\nThen run ./scripts/check.sh. If you change docs/design/"
                      f"{job['milestone']}.md, spawn the architect subagent on {job['milestone']} again and wait for "
                      "its PASS. Commit everything.")
            cost, subtype, _ = self.claude(job, prompt, self.opts.large_model)
            return {"cost": cost, "subtype": subtype}
        prompt = (f"You are continuing feature {job['id']} ({job['title']}) on this branch. Fix only these problems:\n"
                  f"{job['fix_with']}\n\nThen run ./scripts/check.sh, spawn the verifier subagent for {job['id']} again, "
                  f"keep harness/status/{job['id']}.json passing only if the verifier passes (set it blocked with "
                  f"blocked_reason failed otherwise), add a short entry at the top of harness/log/{job['id']}.md, "
                  "and commit everything.")
        cost, subtype, _ = self.claude(job, prompt, self.fix_model(job))
        return {"cost": cost, "subtype": subtype}

    def record_fix(self, job):
        """At merge: did the default model's first fix need another round?"""
        if not job.pop("fixed_by_default_model", False):
            return
        stats = self.state.setdefault("fix_stats", {"tries": 0, "ok": 0})
        stats["tries"] += 1
        stats["ok"] += 1 if job.get("fix_rounds") == 1 else 0
        if stats["tries"] >= 20 and stats["ok"] / stats["tries"] < 0.7 and not stats.get("off"):
            stats["off"] = True
            self.event("loop", f"first fixes on {self.opts.model}: {stats['ok']}/{stats['tries']} held; back to "
                               f"{self.opts.large_model} for all fixes")

    def finish_fix(self, job, res):
        wt = job["worktree"]
        if git("status", "--porcelain", cwd=wt).stdout.strip():
            git("stash", "push", "-q", "-u", "-m", f"loop: uncommitted fix for {job['id']}", cwd=wt)
        guard = run(["git", "show", f"{job['fix_base']}:harness/integrity.py"], cwd=wt).stdout
        # A merge of main is judged against main: the branch's own changes, not main's, must keep the rules.
        guard_base = job.get("fix_guard_base") or job["fix_base"]
        on_main = git("merge-base", "origin/main", "HEAD", cwd=wt, check=False).stdout.strip()
        if not job.get("fix_guard_base") and on_main and git(
                "merge-base", "--is-ancestor", on_main, job["fix_base"], cwd=wt, check=False).returncode:
            guard_base = on_main  # the session rebased or merged newer main itself: main's changes are not the fix's
        check = self.guard(job, guard, guard_base)
        f = next((x for x in backlog.read(wt) if x["id"] == job["id"]), {"status": "passing"} if job.get("kind") else {})
        cut = res.get("subtype") != "success"  # cut off (budget, turns) or crashed: the fix is not done
        merged = git("merge-base", "--is-ancestor", guard_base, "HEAD", cwd=wt, check=False).returncode == 0
        if job.get("fix_guard_base") and not merged and not cut:
            check.returncode, check.stdout = 1, "main was not merged into the branch"
        if cut and self.starved(job, res):  # undo it and try again with a full budget: the round is given back
            git("reset", "-q", "--hard", job["fix_base"], cwd=wt)
            git("clean", "-q", "-fd", cwd=wt)
            if job.pop("fix_guard_base", None):
                job["conflict_rounds"] = 0
            else:
                job["fix_rounds"] -= 1
            return self.set_stage(job, "review", note=f"fix cut off by the run's budget (${job['last_cap']}); "
                                                      "reviewed and fixed again with a full budget")
        if cut or check.returncode != 0 or f.get("status") != "passing":
            git("reset", "-q", "--hard", job["fix_base"], cwd=wt)
            if job.pop("fix_guard_base", None):  # the conflict could not be resolved: build it again from main
                gh("pr", "close", str(job["pr"]), "--comment", "Could not resolve the conflict with main; the loop "
                   "builds this feature again.", cwd=self.root, check=False)
                return self.retry(job, "conflict with main could not be resolved")
            why = (f"the fix session did not finish ({res.get('subtype')})" if cut else check.stdout.strip()
                   or f.get("notes") or "the fix did not keep the feature passing")
            return self.set_stage(job, "held", note="fix failed",
                                  question=f"{job['id']}: the automatic fix failed ({why[:300]}). What should change?")
        if git("rev-parse", "HEAD", cwd=wt).stdout.strip() == job["fix_base"]:
            # Nothing to fix: CI's failure was the machine, not the code. Seen for real: a docs-only design PR failed
            # e2e at load 61, both fix sessions changed nothing, and the loop read the same failed run twice.
            job.pop("ci_rerun_of", None)  # run the failed jobs again rather than spend another fix
        if job.get("fix_guard_base") or guard_base != job["fix_base"]:  # main is merged in: the branch now sits on main
            job["base"], job["base_sha"] = "main", job.pop("fix_guard_base", None) or guard_base
            job["full_review"] = True  # main's changes came in with the merge: review all of it again
        if not self.ensure_base(job):
            return
        with GIT_LOCK:
            git("push", "-q", "-f", "origin", job["branch"], cwd=wt)
        if job.get("pr"):
            gh("pr", "edit", str(job["pr"]), "--base", job["base"], cwd=self.root)
        else:  # a conflict resolved right after the build, before its PR was opened
            self.open_pr(job)
        if job.get("kind"):  # designs and rules had their review in the session
            return self.set_stage(job, "ci", note="fixed")
        self.start_review(job)
