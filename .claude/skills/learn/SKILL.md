---
name: learn
description: Turns a correction or review comment from the human into a durable rule so the same mistake does not recur. Use whenever the human says "don't do X", "always Y", or corrects agent output.
---

# Learn

Every human correction is a harness bug. Fix the harness, not just the output.

1. State the correction in one sentence, and the mistake it prevents.
2. Pick the most mechanical place that can enforce it, in this order:
   1. A lint rule, type, or test (enforced on every run of `scripts/check.sh`).
   2. A check inside the `verifier` or `reviewer` subagent prompt.
   3. A step in a skill (`.claude/skills/*/SKILL.md`).
   4. A numbered rule in `docs/golden-principles.md`, with "Enforced by:".
   5. A line in `CLAUDE.md`. Only for rules every session needs. Keep that file short.
3. Check the rule does not already exist or contradict another. Merge rather than duplicate.
4. Make the change. If it is a lint or test, run `./scripts/check.sh` and fix existing violations or list them.
5. Fix the original output too.
6. Commit: `chore(harness): learn - <rule>`.

Report: the rule, where it now lives, and how it is enforced.

## From the loop
When the build loop runs this skill (`HARNESS_AUTONOMOUS=1`, the arguments name a repeated failure and list its occurrences), there is no human correction and no output to fix. Read the occurrences and the files they point at, find the root cause, and:
- If a written rule would prevent it: add a numbered rule to `docs/golden-principles.md` (below the `/learn` marker, with "Enforced by: reviewer"), and a matching check to the numbered list in `.claude/agents/reviewer.md`. Change no other file: CI refuses a rule PR that touches anything else. Run `./scripts/check.sh` and commit `chore(harness): learn - <rule>`.
- If it needs more than a rule (a lint, test, hook, gate or skill change), or the cause is outside the agents' control (flaky CI, a missing secret), change nothing and end your reply with one line: `PROPOSE: <the change and why>`. The loop asks the human.
- If an existing rule already covers it, make it sharper rather than adding a second one.
- Read `docs/design/*.md` first. A rule must never forbid what an approved design prescribes (a real run learned "no links to routes not built yet" while the design put a redirect to a later feature's route in the first feature). Word it so the design wins ("unless the milestone's design says so"), or, if the design itself looks wrong, change nothing and `PROPOSE:` the design change.
