---
name: kickoff
description: First session of a project. Turns docs/product/spec.md into a granular backlog in harness/features.json and a runnable environment (init.sh, scripts/check.sh). Use once, at project start. For later spec changes use /replan; for an existing codebase use /adopt.
disable-model-invocation: true
model: opus
---

# Kickoff (initializer agent)

Goal: leave the repo so that any later session can start work in under a minute with zero chat history.

1. Read `docs/product/spec.md`. If Problem, Scope or Definition of done is empty, stop and tell the human to run `/interview`. Do not invent scope.
2. If `harness/PRESET.md` exists, the project was installed with a preset: follow it in place of steps 2 to 5, then continue at step 6. Otherwise: if Stack is blank, propose the simplest stack that fits, write it as `docs/decisions/0001-stack.md`, and ask the human to confirm before scaffolding.
3. Scaffold the app with the stack's official generator. Keep it minimal.
4. Write `init.sh` so that `./init.sh` installs deps if missing and starts the dev server on `$PORT` when it is set (the loop gives each parallel lane its own port), on the stack's default otherwise. Print the URL it serves on. Add `.playwright-mcp/` (the verifier's browser logs) and the test runner's output folders to `.gitignore`. Anything else a lane starts (a test database, a mock server) must also derive its port from `$PORT` or `$HARNESS_LANE`.
5. Edit `scripts/check.sh` so it runs this stack's lint, typecheck and tests. It must exit non-zero on any failure, and it must reinstall dependencies when the lockfile is newer than the installed tree (not only when the dependency folder is missing), so a checkout that pulled new dependencies never typechecks against stale ones. Keep its last line, `python3 harness/validate_backlog.py`. Run it and make it pass on the empty app. Edit `.github/workflows/check.yml` so CI installs this stack's dependencies before running it. Write the local Node major to `.nvmrc` (CI and the night workflow read it). Pin every runtime and CLI in CI to the versions on this machine (for example the Node major and any CLI such as `supabase`), so the lockfile and config files parse the same in CI as locally. Add a test that fails when any single e2e test exceeds about 80 lines (golden principle 6). Add the quality gates the stack supports to `check.sh`: a dependency audit (high and critical), static security analysis (Semgrep), an accessibility check in the e2e tests (axe-core), a lint for unsafe database migrations and missing access rules, and a performance budget (Lighthouse CI or the stack's equivalent; in CI if it is slow).
5b. If the product has a UI: set up a design system in one place: tokens (colors, type, spacing, radius) the code uses by name, a small set of base components, a `/styleguide` page showing all of them, and `docs/design-system.md` (style, tokens, components, states, enforced rules) from the spec's Look and feel. Make `check.sh` fail on styling outside the tokens where the stack allows it, and add a visual baseline (screenshot comparison) of `/styleguide`. A preset does this for you.
6. Rewrite `harness/features.json`:
   - One entry per user-visible behavior, small enough to finish and verify in one session. Expect dozens, not five.
   - `milestone`: `M1`, `M2`, ... taken from the spec's milestones. M1 is the smallest usable version.
   - `acceptance`: concrete steps a human would click or type, plus the expected result.
   - `priority`: integer, lower runs first, unique across the file. Order by milestone, then dependency, then value.
   - `type`: `feature` (default), `bug`, or `chore` (work with no new user-visible behavior, such as a baseline test).
   - `depends_on`: ids that must be `passing` before this one can be built and verified. The loop never starts a feature whose dependencies are not passing. Leave it out when there are none.
   - `complexity`: `S`, `M` or `L`. `L` means a session on the default model is unlikely to finish it; the loop runs `L` features on the large model. Prefer splitting an `L` feature over keeping it.
   - `owner_check: true` (optional): the human checks it against what they meant once it merges, because a passing test cannot tell (the look of a key screen, the wording of a flow). The loop also picks the first UI feature of each milestone and about one in four.
   - Leave out `status` and `notes`: every feature starts failing, and its state lives in `harness/status/<id>.json` once a session works on it.
7. Analyze before committing. Check and fix:
   - every scope item in the spec maps to at least one feature, and every feature maps to a scope item
   - nothing listed as out of scope has a feature
   - every acceptance step is something the `verifier` can actually perform and observe
   - every real dependency is in `depends_on`, and none points to a later milestone; `python3 harness/validate_backlog.py` passes (it also catches cycles and unknown ids)
   - choices the spec leaves open are recorded in `docs/decisions/`
8. Fill the Project paragraph in `CLAUDE.md`.
9. Write `harness/log/kickoff.md` with what was set up and decided.
10. Commit: `HARNESS_HUMAN_OVERRIDE=1 git commit -m "chore: kickoff harness and scaffold"`. The override lets the pre-commit integrity guard accept a rewritten backlog. Use it only here and when the human asks for a backlog change.

Report: stack, features per milestone, the first three by priority, analysis fixes made, and anything the human must decide. The human approves the backlog before any `/next` or `/build`.
