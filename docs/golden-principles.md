# Golden principles

Rules every change must follow. Each rule says how it is enforced. Prefer mechanical enforcement (lint, type, test) over prose. When a rule here gets a lint or test, note it.

A milestone's approved design (`docs/design/<M>.md`) takes precedence over the rules `/learn` adds below: where they conflict, follow the design, and fix the rule or the design (with a new decision and a fresh architect PASS).

1. **Validate data at boundaries.** Parse external input (HTTP, env, files, LLM output) into typed values once, at the edge. Enforced by: review.
2. **Reuse before you write.** Search for an existing helper before adding one. No near-duplicate utilities. Enforced by: review, `/garden`.
3. **Small, reversible changes.** One feature per commit. No drive-by refactors inside feature work. Enforced by: `/next` protocol.
4. **Tests prove behavior, not implementation.** Each feature has at least one test that exercises it the way a user would. Enforced by: `verifier` subagent.
5. **No secrets in code or logs.** Read secrets from env. Enforced by: gitleaks in the pre-commit hook and CI, plus review.

6. **Each feature gets its own independent e2e test; never extend another feature's test.** A test signs in, resets only the data it needs, builds its own data, and asserts one feature area. Appending steps to an existing test makes it grow past the test runner's timeout on slower CI machines. Enforced by: `reviewer` subagent, `/next` protocol, and a size check on e2e tests that `/kickoff` adds for the stack.

<!-- /learn appends new rules below. -->

7. **E2E tests never reset or truncate the database.** Loop lanes share one local Supabase stack, so a test creates the rows and users it needs, with names unique to the test (for example suffixed with `$HARNESS_LANE` and a timestamp), and leaves other rows alone. Only a human runs `npm run db:reset`. Enforced by: `reviewer` subagent.

8. **Design tokens and base components only.** UI code uses the token classes (`bg-primary`, `text-muted-foreground`), the Tailwind scale and `components/ui/`, as `docs/design-system.md` says: no color literals, palette colors, arbitrary values or raw form elements. Enforced by: `scripts/ui-tokens.py` in `check.sh`, the `designer` subagent, and the visual baselines in `e2e/__screenshots__/`.

9. **Accessible to everyone.** Every screen meets WCAG 2.2 AA: labels, alt text, contrast, keyboard use. Enforced by: `expectAccessible(page)` (axe-core) in every e2e spec that opens a page, checked by `scripts/e2e-size.py`; Lighthouse in `scripts/perf.sh`; the `designer` subagent.

10. **Migrations keep data.** A schema change is a new migration with a `-- rollback:` comment; never edit one on `main`; expand and backfill first, drop later. Destructive changes need a human decision in `docs/decisions/`. Every public table has row level security. Enforced by: `scripts/migration-lint.py` and `scripts/rls-check.py` in `check.sh`, the `security-reviewer` subagent.
