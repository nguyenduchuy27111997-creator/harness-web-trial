---
name: bug
description: Turn a bug the human found (or a GitHub issue labeled bug) into a backlog entry with reproducible acceptance steps, so /next and /build fix it before other work. Use when the human reports a bug.
argument-hint: <what went wrong, or an issue number like #42>
disable-model-invocation: true
---

# Bug

Report: $ARGUMENTS

1. If the report is an issue number, read it with `gh issue view <n>`.
2. Reproduce it on the running app (`./init.sh` in the background), the way a user would. Write down the exact steps, what happens, and what should happen. If you cannot reproduce it, ask the human with AskUserQuestion for the missing detail. Do not add a bug you could not reproduce, unless the human says to.
3. Find the feature it belongs to in `harness/features.json` (by behavior, not by file). Leave that feature's entry unchanged.
4. Add one entry to `harness/features.json`, following the field rules in `/kickoff` step 6:
   - `id`: the next free `F` number. `type`: `bug`. `milestone`: the milestone of the feature it belongs to, or the current one.
   - `title`: `Fix: <what the user sees go wrong>`.
   - `acceptance`: the reproduction steps, ending with the correct result. The verifier must be able to perform and observe every step.
   - `priority`: the next free integer after the highest one in the file. Bugs already run before other features of the same readiness.
   - `depends_on`: only features that must pass before this fix can be verified.
   - `complexity`: your estimate. Put what you saw, plus `issue #<n>` if it came from GitHub, in `harness/log/<id>.md`.
5. Run `python3 harness/validate_backlog.py`.
6. Show the human the entry and ask them to confirm. Apply corrections.
7. Commit: `HARNESS_HUMAN_OVERRIDE=1 git commit -m "chore(<id>): add bug - <title>"`. The override lets the integrity guard accept a new backlog entry; this is a human-led change.
8. If the repo is on GitHub, run `python3 harness/sync_issues.py` so the bug has its mirrored issue.

Do not fix the bug here. The fix happens in `/next <id>`, which writes a failing regression test first.
