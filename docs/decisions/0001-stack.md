# 0001: Stack (Next.js + Supabase preset)

- Date: 2026-11-02
- Status: accepted

## Context
The project was installed with the harness-kit `nextjs-supabase` preset, so the stack is decided before /kickoff.

## Decision
- Next.js (App Router, TypeScript), scaffolded by `scripts/preset-setup.sh` with pinned versions: Next 16.4.2 (Turbopack for `next dev` and `next build`, ESLint run directly with `eslint-config-next`'s flat config, since `next lint` is gone). Next 15 needed npm overrides for the postcss and sharp it bundles to pass `npm audit`; 16.3.8 passed without them. 16.4.2 is pinned less than two weeks after release, against the usual rule, because `npm audit` found a critical advisory in 16.0.0–16.4.0 on 2026-10-23.
- Supabase: a local stack in Docker for development and tests, on its own port block; a persistent preview branch for staging.
- UI: Tailwind CSS with shadcn/ui: design tokens as CSS variables in `app/globals.css`, base components in `components/ui/`, rules in `docs/design-system.md`.
- Gates beyond tests: `npm audit`, Semgrep, migration lint, RLS check, axe-core in e2e, Lighthouse CI budgets in CI.
- Tests: Vitest with coverage thresholds for `lib/`, Playwright for e2e (one file per feature), jscpd for duplication.
- Staging: Vercel preview deployment pointing at the Supabase branch (`scripts/deploy-staging.sh`). Production is promoted by a human.

## Consequences
- Every worktree and loop lane shares one local database, so tests never reset it (golden principle 7).
- e2e runs in Playwright's Linux browser in Docker (`scripts/browser.sh`), locally and in CI, so the visual baselines (`toHaveScreenshot`) are the same pixels everywhere and compared everywhere. The browser reaches the local app and Supabase through Playwright's loopback tunnel.
- CI runs the e2e suite in parallel shards on GitHub's runners; loop sessions run only their feature's specs.
- Staging needs Supabase branching on the project and the tokens listed in `scripts/deploy-staging.sh`.
