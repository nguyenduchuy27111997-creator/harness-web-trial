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
