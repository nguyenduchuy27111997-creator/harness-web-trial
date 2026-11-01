---
name: replan
description: Update harness/features.json after docs/product/spec.md changed, keeping finished work. Adds features for new scope, removes features for dropped scope, and re-opens passing features whose acceptance changed. Use when the human edits the spec or asks to re-plan.
disable-model-invocation: true
model: opus
---

# Replan

Goal: the backlog matches the current spec again, and nothing already verified is lost or silently changed.

1. Find what changed in the spec: `git log --oneline -- docs/product/spec.md`, then diff it since the last `kickoff` or `replan` progress entry. If nothing changed, ask the human what to re-plan and stop if there is nothing.
2. List the scope items that were added, removed, or changed.
3. Draft the backlog changes, following the field rules in `/kickoff` step 6:
   - **Added scope:** new features with the next free ids and priorities (no status file: they start failing).
   - **Removed scope:** delete the features that only served it. Delete `passing` features too, and their `harness/status/<id>.json`; their history stays in git. Remove them from any `depends_on`.
   - **Changed scope:** if a feature's `acceptance` changes, set its `harness/status/<id>.json` back to `failing` with `notes` saying what changed. Never edit the acceptance of a feature and keep it `passing`.
   - Never change `id`. Renumber priorities only if the order really changed.
4. Run the analyze step of `/kickoff` (step 7) on the whole backlog, plus `python3 harness/validate_backlog.py`.
5. Show the human a short table: added, removed, re-opened, re-ordered. Ask them to confirm with AskUserQuestion. Apply corrections.
6. Record the reason for the re-plan in `docs/decisions/` (one file).
7. Add an entry to `harness/log/replan.md`.
8. Commit: `HARNESS_HUMAN_OVERRIDE=1 git commit -m "chore: replan backlog - <one line why>"`. On GitHub, run `python3 harness/sync_issues.py`.
9. For each milestone that already has `docs/design/<M>.md` and gained, lost or changed features, run `/design <M>` to bring its design up to date (its own commit, with a fresh architect PASS). Milestones without a design doc get one from the loop.

A PR containing this commit fails the CI integrity guard by design; the human merges it with an admin override.
