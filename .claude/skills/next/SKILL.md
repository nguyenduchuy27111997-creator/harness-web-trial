---
name: next
description: One coding session. Picks the highest-priority failing feature from harness/features.json, implements it, has the reviewer and verifier subagents check it, then commits and logs progress. Use for all routine feature work, interactive or headless.
argument-hint: [milestone like M1, or feature id like F012]
---

# Next (coding agent)

Argument: $ARGUMENTS

Anything after the feature id is context from the human (for example an answer the loop relayed); use it.

## 1. Get your bearings
- `git status` and `git log --oneline -10`.
- Read `harness/log/<id>.md` for the feature you pick, if it exists.
- Pick the feature:
  - argument is a feature id (`F...`): work on that one. If it is `blocked` with `blocked_reason: failed`, this is a retry: read its `notes` and the last progress entry for it, and try a different approach than last time.
  - argument is a milestone (`M...`): `python3 harness/next_feature.py --milestone <it>`.
  - no argument: `python3 harness/next_feature.py`.
- If nothing is printed, there is no failing feature in scope: report that and stop.

## 2. Check the ground is solid
- Run `./scripts/check.sh`. If it fails before you touch anything, fixing it IS this session's task. Log it and stop after the fix.
- Start the app with `./init.sh` (in the background) and use the URL it prints. When `$PORT` is set (the loop gives each lane its own), the app is on `http://localhost:$PORT`; never assume port 3000, which may be another app.

## 3. Implement
- Read only the docs this feature needs (follow the map in `CLAUDE.md`).
- To find where something is (a component, a route, a query, the tests and helpers for an area), spawn the `explorer` subagent (cheap, read-only) instead of opening many files yourself.
- Read `docs/design/<milestone>.md` if it exists and build to it: its data model, migrations, contract and module rules. The reviewer flags any departure as a bug.
- If the feature cannot be built on the design, do not diverge silently. Change the design doc as little as possible, write why in a new decision in `docs/decisions/`, and spawn the `architect` subagent on the milestone (foreground). The integrity guard refuses a changed design doc without a fresh architect PASS for exactly its content.
- Follow `docs/golden-principles.md`.
- A feature of `complexity` L (`python3 harness/next_feature.py --get <id> complexity`) whose work falls into parts with separate files (for example the data layer, the server actions, the page): split it.
  - Write the contract the parts share (names, routes, types, function signatures) and give each part its own files; no file belongs to two parts.
  - Spawn one `part-coder` subagent per part, all in one message so they run at the same time, each with the feature id, its part, its files and the contract.
  - Wait for all of them, then join the parts yourself: fill what they said was missing, make the names meet, and run the full checks. Two or three parts is usual; a feature that does not split cleanly is built as one.
- `type: bug`: first write the e2e test that reproduces the bug and watch it fail, then fix.
- `type: chore` titled `Baseline: ...`: the behavior already exists. Write its e2e test and verify; change no product code. If it does not work, mark it `blocked` with `blocked_reason: needs_human`.
- UI: follow `docs/design-system.md` if it exists: tokens, base components, the states it asks for. End the feature's e2e test with a visual baseline of its final state if the stack has them (see `harness/PRESET.md`). Update another feature's baseline only when your acceptance changes that page; the `designer` subagent reviews every changed baseline.
- In the loop, a `test-writer` agent may be writing this feature's e2e test beside you; the prompt then says so and where it hands over. Build to that test and never change it. Otherwise, write a new, independent e2e test for this feature (own `test()`, own sign-in and data; never add steps to another feature's test, principle 6) that exercises the feature the way a user would.
- Work on this one feature only. If you find an unrelated bug, add it to `notes` of the relevant feature and move on.
- If the feature needs a design choice that is in neither the design doc nor `docs/decisions/`, make the smallest reasonable choice and record it as a new decision file.

## 4. Verify
- `./scripts/check.sh` must pass. In the loop (`HARNESS_AUTONOMOUS=1`), start it in the background and spawn the verifier (below) at the same time, on the same app, instead of one after the other; if either fails, fix it and run both again.
- Review: spawn the `reviewer` subagent on your uncommitted diff (`git diff HEAD` plus new files). Fix only `bug` findings and violations of a golden principle. Ignore the rest; do not over-engineer. Re-run `check.sh` if you changed anything. In the loop (`HARNESS_AUTONOMOUS=1`), skip this step: the loop's review stage runs the reviewer and the other lenses on the PR, so a review here would be paid for twice.
- Spawn the `verifier` subagent with the feature id. Do not mark passing on your own judgment.
- Wait for each subagent's result before you go on (run it in the foreground if your Agent tool lets you choose). Never end your turn while a subagent you spawned is still running: in a headless run the session ends with your turn, and the loop counts unfinished work as a failed attempt.
- A hook saves the verifier's report as `harness/evidence/<id>.md`, next to its screenshots in `harness/evidence/<id>/`. Never write or edit anything under `harness/evidence/` yourself. A feature cannot be committed as `passing` without a fresh PASS there.
- If the verifier fails it, fix and re-verify. Go on while each round passes more of its `CRITERION` lines. After 2 rounds in a row with no more passing, the same criterion failing the same way a third time, or 5 rounds in all, set `status` to `blocked` and `blocked_reason` to `failed`, write what you tried and what still fails in `notes`, and go to step 5. The loop retries it later a rung higher (more effort, an advisor, then a stronger model).
- If the feature needs something only a human can provide (an API key, an account, a product decision), mark it `blocked` right away with `blocked_reason: needs_human` and what the human must do in `notes`. Do not fake it.

## 5. Close the session
- Write `harness/status/<id>.json`: `status` (`passing` or `blocked`), `notes`, and `blocked_reason` when blocked. Do not edit `harness/features.json`; `attempts` belongs to the loop.
- Add an entry to the TOP of `harness/log/<id>.md`: `## YYYY-MM-DD HH:MM · <passing|blocked>` and three bullets, `- Did:`, `- Verified by:`, `- Next session should know:`.
- Commit everything, evidence included: `feat(<id>): <title>` or `chore(<id>): blocked - <reason>`.
- The pre-commit hook runs `harness/integrity.py` and gitleaks. If it refuses the commit, fix the cause (undo the test or backlog change, remove the secret, or mark the feature `blocked`). Never bypass it.
- Stop the dev server you started.

Report in 3 lines: feature, result, what the next session should know.
