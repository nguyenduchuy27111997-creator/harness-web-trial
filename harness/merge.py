"""From CI to main: PR checks, the merge queue, stacked PRs, rebases and conflicts, main's CI and reverts. A mixin of loop.Loop."""

import json
import re
import time

from common import (  # noqa: F401
    ci_log, gh, git, lang, now, run, DONE, GIT_LOCK, MAIN_GRACE, Path,
)


class Merge:
    # stage: ci, waiting on base, merging ------------------------------------------------
    def pr_checks(self, job):
        r = gh("pr", "checks", str(job["pr"]), "--json", "bucket,name,link", cwd=self.root, check=False)
        if "no checks reported" in (r.stderr + r.stdout):
            return "none"
        try:
            checks = json.loads(r.stdout or "[]")
        except ValueError:
            return "pending"
        buckets = [c["bucket"] for c in checks]
        job["ci_runs"] = sorted({m.group(1) for c in checks if c["bucket"] in ("fail", "cancel")
                                 for m in [re.search(r"/actions/runs/(\d+)", c.get("link") or "")] if m})
        if not buckets:
            return "none"
        if any(b in ("fail", "cancel") for b in buckets):
            return "fail"
        return "pass" if all(b in ("pass", "skipping") for b in buckets) else "pending"

    def not_started(self, run_ids):
        """True when a failed run's jobs never started (no runner, no steps): GitHub refused to run them,
        for example for billing. A real run saw it as a failure and reverted a good feature."""
        for rid in run_ids:
            out = gh("run", "view", str(rid), "--json", "jobs", cwd=self.root, check=False).stdout
            try:
                jobs = json.loads(out or "{}").get("jobs", [])
            except ValueError:
                continue
            if any(j.get("conclusion") == "failure" and not j.get("steps") for j in jobs):
                return True
        return False

    def block_ci(self, url):
        if not self.state["ci_blocked"]:
            self.state["ci_blocked"] = True
            self.push(f"ci_blocked:{self.state['started']}", lang.say("CI is not starting"),
                      lang.say("GitHub Actions starts no jobs (billing or runner). Nothing merges until it does."), priority=4)
            self.event("loop", f"ci blocked: GitHub Actions did not start the jobs ({url or 'no link'}); check the "
                               "account's Billing & plans (spending limit, payment). Nothing merges or reverts until CI runs.")

    def pr_head(self, job):
        return gh("pr", "view", str(job["pr"]), "--json", "headRefOid", "--jq", ".headRefOid", cwd=self.root,
                  check=False).stdout.strip()

    def advance_ci(self, job):
        # The head before its checks: a push in between gets checks of its own (pending), and a merge of
        # this older head is refused, so what merges is always a commit CI passed.
        head = self.pr_head(job)
        result = self.pr_checks(job)
        if result == "none":  # a repo without workflows: give GitHub a moment to register them
            job["no_checks"] = job.get("no_checks", 0) + 1
            if job["no_checks"] < 3:
                return
            result = "pass"
        if result == "pending":
            return
        if result == "fail" and self.not_started(job.get("ci_runs", [])):
            return self.block_ci(job.get("pr_url"))  # not the code: wait for CI to run at all
        if result == "fail":
            head = git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()
            if job.get("ci_rerun_of") != head and job.get("ci_runs"):
                # Once per commit, run the failed jobs again before spending a fix session on them.
                # Seen for real: a rule PR that changed two docs failed a one-run Lighthouse score (0.86 < 0.9).
                if self.machine_busy():
                    return  # a rerun at load 61 failed the same way; rerun once the machine eases
                job["ci_rerun_of"] = head
                for run_id in job["ci_runs"]:
                    gh("run", "rerun", run_id, "--failed", cwd=self.root, check=False)
                return self.set_stage(job, "ci", note="CI failed; running the failed jobs again in case it was a flake")
            if self.lanes_busy() >= self.lane_limit():
                return  # no lane free for the fix yet; look again next tick
            if job["fix_rounds"] >= 2:
                return self.set_stage(job, "held", note="CI still fails after 2 fixes",
                                      question=f"{job['id']}: CI keeps failing on {job['pr_url']}. What should change?")
            if not self.can_start():
                job["fix_waits"] = True  # a run with budget picks it up
                return
            job.pop("fix_waits", None)
            self.failure(job, "CI failed on the PR")
            log = "\n".join(gh("run", "view", rid, "--log-failed", cwd=self.root, check=False).stdout
                            for rid in job.get("ci_runs", []))
            excerpt = ci_log.trim(log) if log.strip() else ""
            job["ci_log"] = excerpt  # the CI doctor reads it before the fix session (stages.work_fix)
            return self.start_fix(job, f"CI failed on the PR ({job['pr_url']}). Run ./scripts/check.sh, find the failure "
                                       "and fix it." + (f"\n\nThe failed steps' log (last lines):\n```\n{excerpt}\n```"
                                                        if excerpt else ""))
        job["ci_sha"] = head or git("rev-parse", "HEAD", cwd=job["worktree"]).stdout.strip()  # what CI passed
        if job["base"] != "main":
            return self.set_stage(job, "waiting_base", note=f"green; waits for {job['base']} to merge")
        self.set_stage(job, "merging")

    def advance_merge(self, job):
        if self.state["main_red"] and not job.get("revert_of"):
            return  # nothing but the revert merges onto a red main
        wt = job["worktree"]
        with GIT_LOCK:
            git("fetch", "-q", "origin", cwd=wt)
            behind = git("merge-base", "--is-ancestor", "origin/main", "HEAD", cwd=wt, check=False).returncode != 0
        if behind:  # main moved since CI ran: rebase, push, and let CI run again
            # One at a time: green PRs that all rebase onto the same main run CI for nothing once the first
            # merges. Seen for real: F025 rebased 4 times on one runner, 2 hours from green to merged.
            # The turn is held while that CI runs: green and behind again, two PRs waited on each other for 2 hours.
            if any(j.get("requeued") and j["stage"] == "ci" and j["id"] != job["id"]
                   for j in self.state["jobs"].values()):
                return
            if not self.rebase(job, "origin/main"):
                return
            job["requeued"] = True
            return self.set_stage(job, "ci", note="rebased on the new main")
        lead = round(time.time() - job.get("first_started", time.time()))
        job["lead_seconds"] = lead
        # Only the commit CI passed may merge: a push after CI (by anyone) sends it back to CI.
        verified = job.get("ci_sha") or git("rev-parse", "HEAD", cwd=wt).stdout.strip()
        merge = gh("pr", "merge", str(job["pr"]), "--squash", "--match-head-commit", verified,
                   "--subject", f"{job['id']}: {job['title']} (#{job['pr']})",
                   "--body", f"Harness-Cost: ${job.get('cost', 0):.2f}\nHarness-Sessions: {len(job.get('sessions', []))}\n"
                             f"Harness-Time: {lead // 60} min" + (f"\nHarness-Session-Ids: {', '.join(ids)}" if (ids := [
                                 x["session_id"] for x in job.get("sessions", []) if x.get("session_id")]) else ""),
                   cwd=self.root, check=False)
        if merge.returncode != 0:
            why = (merge.stderr or merge.stdout).strip()[-400:]
            head = self.pr_head(job)
            if head and head != verified:
                return self.set_stage(job, "ci", note=f"the PR changed after CI passed ({head[:7]}); CI again")
            raise RuntimeError(f"gh pr merge failed: {why}")  # a network error retries; anything else is held
        job["merge_sha"] = gh("pr", "view", str(job["pr"]), "--json", "mergeCommit", "--jq", ".mergeCommit.oid",
                              cwd=self.root).stdout.strip()
        job["merged_at"], job["merged_run"] = now(), self.state["started"]
        if not job.get("kind") and not job.get("revert_of"):  # the branch is deleted soon: images point at the commit
            body = self.home / f"pr-{job['id']}.md"
            body.write_text(self.pr_body(job, job.get("findings", "")).replace(f"/blob/{job['branch']}/",
                                                                                f"/blob/{job['merge_sha']}/"))
            gh("pr", "edit", str(job["pr"]), "--body-file", str(body), cwd=self.root, check=False)
        self.set_stage(job, "merged", note=f"#{job['pr']} -> main {job['merge_sha'][:7]}")
        self.record_fix(job)
        try:
            self.maybe_sample(job)
        except Exception as e:  # the merge is done; a sample that failed to post is only logged
            with (self.home / "loop.log").open("a") as f:
                f.write(f"{now()} {job['id']} owner check not posted: {e!r}\n")
        self.state["last_merge"] = job["id"]
        for dep_job in self.state["jobs"].values():  # idle PRs stacked on this one move to main now;
            if (dep_job.get("base") == job["branch"] and dep_job["id"] not in self.threads
                    and dep_job["stage"] in ("review", "ci", "waiting_base", "merging")):
                self.restack(dep_job)        # ones with a session running move when it ends
        with GIT_LOCK:
            self.remove_worktree(job)
        self.delete_merged_branches()

    def base_merged(self, job):
        return job["base"] != "main" and any(j.get("branch") == job["base"] and j["stage"] == "merged"
                                             for j in self.state["jobs"].values())

    def ensure_base(self, job):
        """A job stacked on a PR that has merged since: rebase it onto main. False if that failed."""
        if not self.base_merged(job):
            return True
        with GIT_LOCK:
            git("fetch", "-q", "origin", cwd=job["worktree"])
        cmd = ["rebase", "-q", "--onto", "origin/main", job["base_sha"]]
        if git(*cmd, cwd=job["worktree"], check=False).returncode != 0 and not self.regenerate(job):
            files = git("diff", "--name-only", "--diff-filter=U", cwd=job["worktree"], check=False).stdout.split()
            git("rebase", "--abort", cwd=job["worktree"], check=False)
            if not job.get("conflict_rounds") and self.can_start() and not self.paused():
                # Finished, verified work: a session merges main in instead of building it again (a rule job
                # proposed this after F015 was rebuilt from scratch twice).
                return self.resolve(job, "origin/main", files)
            if job.get("pr"):
                gh("pr", "close", str(job["pr"]), cwd=self.root, check=False)
            self.retry(job, "conflict while moving onto main after its base merged")
            return False
        job["base"] = "main"
        job["base_sha"] = git("rev-parse", "origin/main", cwd=job["worktree"]).stdout.strip()
        return True

    def delete_merged_branches(self):
        """Delete a merged feature's branch once no open work is stacked on it."""
        for job in self.state["jobs"].values():
            if job["stage"] != "merged" or job.get("branch_deleted"):
                continue
            if any(j.get("base") == job["branch"] and j["stage"] not in DONE for j in self.state["jobs"].values()):
                continue
            with GIT_LOCK:
                git("push", "-q", "origin", "--delete", job["branch"], cwd=self.root, check=False)
                git("branch", "-q", "-D", job["branch"], cwd=self.root, check=False)
            job["branch_deleted"] = True

    def rebase(self, job, onto, upstream=None):
        wt = job["worktree"]
        cmd = ["rebase", "-q", "--onto", onto, upstream] if upstream else ["rebase", "-q", onto]
        # A branch a session merged main into takes newer main the same way: a rebase drops that merge and replays
        # the old commits into the conflict it resolved. Seen for real: F020 and F021 were closed and built again.
        merged_in = not upstream and git("rev-list", "--merges", "-n1", f"{onto}..HEAD", cwd=wt).stdout.strip()
        if merged_in:
            cmd = ["merge", "-q", "--no-edit", onto]
        if git(*cmd, cwd=wt, check=False).returncode != 0 and (merged_in or not self.regenerate(job)):
            files = git("diff", "--name-only", "--diff-filter=U", cwd=wt, check=False).stdout.split()
            git("merge" if merged_in else "rebase", "--abort", cwd=wt, check=False)
            if not job.get("revert_of") and not job.get("conflict_rounds"):
                if self.can_start() and not self.paused():
                    return self.resolve(job, onto, files)  # a session merges main in, rather than building it again
                if self.busy or self.paused():  # only the machine says not now: keep the PR, try on a later tick
                    if not job.get("resolve_waits"):
                        job["resolve_waits"] = True
                        self.event(job["id"], f"conflict with main in {', '.join(files[:5]) or 'some files'}; "
                                              "the session that resolves it waits for a less busy machine")
                    return False
            job.pop("resolve_waits", None)
            gh("pr", "close", str(job["pr"]), "--comment", "Could not rebase; the loop builds this feature again.",
               cwd=self.root, check=False)
            self.retry(job, f"conflict while rebasing onto {onto}")
            return False
        with GIT_LOCK:
            git("push", "-q", "-f", "origin", job["branch"], cwd=wt)
        return True

    def regenerate(self, job):
        """Go on with a stopped rebase whose only conflicts are generated files: take main's copy, write the
        file again with its command (harness/generated.json maps each file to one) and continue. Every route
        feature of the API preset regenerates openapi.json, so parallel lanes kept conflicting on it and
        paying a session to merge. False, with the rebase still stopped, when anything else conflicts."""
        wt = job["worktree"]
        try:
            gen = json.loads((Path(wt) / "harness/generated.json").read_text())
        except (OSError, ValueError):
            return False
        done = []
        for _ in range(200):  # one round per commit that conflicts
            files = git("diff", "--name-only", "--diff-filter=U", cwd=wt, check=False).stdout.split()
            if files:
                if not all(f in gen for f in files):
                    return False
                for f in files:
                    git("checkout", "--ours", "--", f, cwd=wt)  # in a rebase, "ours" is main's side
                for cmd in dict.fromkeys(gen[f] for f in files):
                    if run(["bash", "-c", cmd], cwd=wt).returncode != 0:
                        return False
                git("add", "--", *files, cwd=wt)
                done += [f for f in files if f not in done]
                step = git("-c", "core.editor=true", "rebase", "--continue", cwd=wt, check=False)
            elif git("diff", "--cached", "--quiet", cwd=wt, check=False).returncode == 0 and done:
                step = git("rebase", "--skip", cwd=wt, check=False)  # nothing left of its own once regenerated
            else:  # stopped for another reason (a hook, say): never drop a commit
                return False
            if step.returncode == 0:
                self.event(job["id"], f"conflict only in generated {', '.join(done)}; regenerated it from the merged code")
                return True
        return False

    def resolve(self, job, onto, files):
        """Hand a conflict with main to a session: it merges main into the branch and resolves it, once per job."""
        job["conflict_rounds"] = 1
        job.pop("resolve_waits", None)
        job["fix_guard_base"] = git("rev-parse", onto, cwd=job["worktree"]).stdout.strip()
        self.event(job["id"], f"conflict with main in {', '.join(files[:5]) or 'some files'}; a session resolves it")
        self.start_fix(job, f"Main moved on and this branch now conflicts with it (in: {', '.join(files) or 'unknown files'}). "
                            f"Run `git merge {onto}` (already fetched), resolve every conflict so this feature and "
                            "everything main gained both keep working, keep main's tests as they are, and commit the "
                            "merge.", count=False)
        return False

    def advance_waiting(self, job):
        """A stacked PR whose base has merged, and that is not moving onto main yet: the merge's restack can be
        put off (a conflict whose session waits for a less busy machine) and nothing else tries again. Seen for
        real: F031 sat in waiting_base for 3 hours after F028 merged."""
        if self.base_merged(job) and job["id"] not in self.threads:
            self.restack(job)

    def restack(self, job):
        with GIT_LOCK:
            git("fetch", "-q", "origin", cwd=job["worktree"])
        # Retarget first: the rebase push starts CI, and a run whose base is the merged branch fails once
        # that branch is deleted (the trial's F002 and F004 both failed the integrity guard this way).
        gh("pr", "edit", str(job["pr"]), "--base", "main", cwd=self.root)
        if self.rebase(job, "origin/main", job["base_sha"]):
            job["base"] = "main"
            job["base_sha"] = git("rev-parse", "origin/main", cwd=job["worktree"]).stdout.strip()
            self.set_stage(job, "review" if job["stage"] == "review" else "ci", note="base merged; rebased onto main")

    # main after a merge -----------------------------------------------------------------
    def main_ci(self, sha):
        out = gh("run", "list", "--commit", sha, "--json", "status,conclusion,url,databaseId", cwd=self.root,
                 check=False).stdout
        runs = json.loads(out or "[]")
        if not runs:
            return "none", ""
        failed = [r for r in runs if r["status"] == "completed" and r["conclusion"] not in ("success", "skipped", "neutral")]
        if failed and self.not_started([r["databaseId"] for r in failed if r.get("databaseId")]):
            return "blocked", failed[0].get("url", "")
        # A failed or cancelled run is run again, once, before it counts. A cancelled run or one the runner
        # lost says nothing about the code, and a one-off failure (a latency budget on a busy self-hosted
        # machine) got a docs-only feature reverted in a real run. Failing a second time, it is real.
        reran = self.state.setdefault("reran_runs", [])
        again = [r for r in failed if r.get("databaseId") and str(r["databaseId"]) not in reran]
        for r in again:
            reran.append(str(r["databaseId"]))
            gh("run", "rerun", str(r["databaseId"]), cwd=self.root, check=False)
        if again:
            return "pending", ""
        if failed:
            return "fail", failed[0].get("url", "")
        return ("pass", "") if all(r["status"] == "completed" for r in runs) else ("pending", "")

    def watch_main(self):
        for job in list(self.state["jobs"].values()):  # revert() adds jobs
            if job["stage"] != "merged" or job.get("main_checked"):
                continue
            result, url = self.main_ci(job["merge_sha"])
            if result == "none":
                self.main_ci_since.setdefault(job["id"], time.time())
                if time.time() - self.main_ci_since[job["id"]] > MAIN_GRACE:
                    job["main_checked"] = True
                continue
            if result == "pending":
                continue
            if result == "blocked":
                self.block_ci(url)
                continue
            head = self.state.get("main_sha")
            if (result == "fail" and head and head != job["merge_sha"] and not job.get("revert_of")
                    and git("merge-base", "--is-ancestor", job["merge_sha"], head, cwd=self.root,
                            check=False).returncode == 0):
                # Main has moved on since: its newest CI, which runs this feature too, decides. A real run
                # reverted two features over a flaky e2e check that passed on the very next main commit.
                later, _ = self.main_ci(head)
                if later in ("pending", "none", "blocked"):
                    continue
                if later == "pass":
                    job["main_checked"] = True
                    self.event(job["id"], f"main CI failed on its merge ({url}) but passed on {head[:7]}, which "
                                          "includes it: a flaky check, not reverting")
                    continue
            job["main_checked"] = True
            if result == "fail" and job.get("revert_of"):  # never revert a revert: a human decides
                self.set_stage(job, "held", note=f"main CI still fails after the revert: {url}",
                               question=f"Main's CI still fails after reverting {job['revert_of']} ({url}). "
                                        "Something else broke main; nothing merges until it is green.")
            elif result == "fail":
                self.revert(job, url)
        if self.state["main_red"]:
            revert = self.job(self.state["main_red_by"])
            if revert and revert["stage"] == "merged" and revert.get("main_checked"):  # its own main CI passed
                self.state["main_red"] = False
                self.event(revert["id"], "main is green again")
            elif (not revert or revert["stage"] == "dropped") and self.main_ci(self.state["main_sha"])[0] == "pass":
                self.state["main_red"] = False  # a human dropped the revert and made main green another way
                self.event(self.state["main_red_by"], "main is green again without the revert")

    def revert(self, job, url):
        self.failure(job, "main CI failed after merge")
        fid, rid = job["id"], f"R-{job['id']}"
        self.state["main_red"], self.state["main_red_by"] = True, rid
        rev = {"id": rid, "title": f"Revert {fid}", "branch": f"agent/revert-{fid}", "base": "main",
               "worktree": str(self.trees / rid), "attempts": 0, "fix_rounds": 2, "cost": 0.0, "answers": [],
               "revert_of": fid}
        self.state["jobs"][rid] = rev
        with GIT_LOCK:
            git("fetch", "-q", "origin", cwd=self.root)
            self.remove_worktree(rev)
            git("worktree", "add", "-q", "-B", rev["branch"], rev["worktree"], "origin/main", cwd=self.root)
            git("revert", "--no-edit", job["merge_sha"], cwd=rev["worktree"])
            git("push", "-q", "-f", "-u", "origin", rev["branch"], cwd=rev["worktree"])
        url_pr = gh("pr", "create", "--base", "main", "--head", rev["branch"], "--title", f"Revert {fid}: main CI failed",
                    "--body", f"Main CI failed after #{job['pr']} merged: {url}\n\nOpened by the harness loop.",
                    cwd=self.root).stdout.strip()
        rev["pr"], rev["pr_url"] = int(url_pr.rstrip("/").rsplit("/", 1)[-1]), url_pr
        self.set_stage(rev, "ci", note=f"reverting {fid}")
        self.set_stage(job, "reverted", note=f"main CI failed after merge: {url}",
                       question=f"{fid} was merged but main's CI then failed ({url}); the loop reverted it. "
                                "Tell it what to watch out for, and it builds the feature again.")

    # housekeeping ------------------------------------------------------------------------
    def remove_worktree(self, job):
        wt = job.get("worktree")
        if wt and Path(wt).exists():
            git("worktree", "remove", "--force", wt, cwd=self.root, check=False)
        git("worktree", "prune", cwd=self.root, check=False)
