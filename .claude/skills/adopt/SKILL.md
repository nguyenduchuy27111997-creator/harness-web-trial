---
name: adopt
description: Bring an existing codebase under the harness (brownfield). Writes the spec and decisions from what the code already does, wires init.sh, check.sh and CI to the existing stack, and builds a backlog with baseline entries for existing behavior plus failing entries for new work. Use once, instead of /interview and /kickoff, on a repo that already has an app.
argument-hint: [what the human wants to build next]
disable-model-invocation: true
model: opus
---

# Adopt (brownfield kickoff)

Goal: same end state as `/kickoff`, without rewriting what exists. New work: $ARGUMENTS

1. Map the repo: stack, entry points, how it runs, how it is tested, where data lives. Read the README and existing docs first. Do not change product code in this session.
2. Write `docs/decisions/0001-existing-stack.md` (what is there and why it stays) and one decision file for any convention a new contributor must follow.
3. Write `docs/product/spec.md` from what the app does today: Problem, Users, current flows as "Existing", the new work as milestones, Out of scope, Definition of done. Then interview the human with AskUserQuestion (1 to 4 questions per round) about gaps and the new work, the same way `/interview` does. Stop when every section is concrete.
4. Add rules that match the existing code to `docs/golden-principles.md` (naming, layering, error handling), each with "Enforced by:". Do not add a rule the current code mostly breaks; record it as a decision instead.
5. If `harness/PRESET.md` exists, run its setup script now (it keeps the existing app and only adds what is missing), then check its rules against the existing code and record any difference as a decision. In all cases: make `./init.sh` start the existing app and `./scripts/check.sh` run its existing lint, typecheck and tests, keeping the last line `python3 harness/validate_backlog.py`. Run it. If existing checks fail, do not fix product code: record what fails in `docs/decisions/` and make `check.sh` run only what passes today, each skipped check named in a comment. Adapt `.github/workflows/check.yml` the same way, pinning runtimes to this machine's versions. Make `init.sh` serve on `$PORT` when set, and add `.playwright-mcp/` and the test runner's output folders to `.gitignore`.
6. Build `harness/features.json`, following the field rules in `/kickoff` step 6:
   - **Baseline:** one `type: chore` entry per important existing user flow, titled `Baseline: <flow>`, with acceptance steps that end in "an independent e2e test covers it and no product code changed". Order them first, so the loop builds the regression net before new work.
   - **New work:** `type: feature` entries for the new scope, with `depends_on` pointing at the baseline entries they touch.
7. Run the analyze step of `/kickoff` (step 7) and `python3 harness/validate_backlog.py`.
8. Fill the Project paragraph in `CLAUDE.md`. Write `harness/log/adopt.md` with what was mapped and decided.
9. Commit: `HARNESS_HUMAN_OVERRIDE=1 git commit -m "chore: adopt harness"`.

Report: stack, baseline flows, new features per milestone, checks skipped and why, and what the human must decide. The human approves the backlog before any `/next` or `/build`.
