---
name: release
description: Release gate for one milestone. Confirms every feature in it passes, re-verifies all passing features end to end, runs a security review, writes release notes, and deploys to staging if a staging script exists. Never deploys to production.
argument-hint: <milestone, e.g. M1>
disable-model-invocation: true
model: opus
---

# Release

Milestone: $ARGUMENTS

1. In `harness/features.json`, list the features whose `milestone` is this one. If any is not `passing` in `harness/status/<id>.json` (no file means failing), stop and report which ones and why (from its `notes`). The milestone is not done.
2. `./scripts/check.sh` must pass on a clean tree.
3. Regression: spawn the `verifier` subagent for every `passing` feature in this milestone and all earlier milestones. Run them one at a time when they use the browser: they share this session's one Playwright browser (seen in the web trial). Collect verdicts.
   - Any FAIL: set that feature back to `failing` in `harness/status/<id>.json`, put the verifier's problem in `notes`, commit, and stop. Report the regressions.
4. Security: run the `/security-review` skill on the changes since the last release tag (or the whole repo if there is none). Fix any high-severity finding in a separate commit, re-run `check.sh`, and record anything you left as a decision in `docs/decisions/`.
5. Write `docs/releases/<milestone>.md`: what users can now do (from feature titles), known limitations, blocked or deferred items, security notes. List a limitation only if you or a verifier reproduced it; put an impression from a screenshot under "Unconfirmed" (in the web trial, two such impressions failed to reproduce in `/bug`).
6. Commit, then tag: `git tag <milestone>-rc`, and push both: `git push origin HEAD <milestone>-rc`.
7. If `scripts/deploy-staging.sh` exists, run it and report the URL it prints. If it does not exist, say so and suggest what it should contain for this stack. Do not create production deploy steps.
8. Add a progress entry (feature id: `release-<milestone>`).
9. Stop any dev server you started; it holds its port for the next session.

Report: verdicts per feature, security findings, staging URL or what is missing, and what the human must check before promoting to production.
