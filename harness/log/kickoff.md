# Kickoff

## 2026-11-02
- Stack: `nextjs-supabase` preset (`docs/decisions/0001-stack.md`), scaffolded with `scripts/preset-setup.sh bookshelf`: Next.js 16.4.2, local Supabase on ports 56320-56329, shadcn/ui, Playwright + axe-core, Vitest, Semgrep, npm audit, migration and RLS lint, Lighthouse CI in CI. `./scripts/check.sh` passes on the empty app.
- Design system: tokens in `app/globals.css` set from the spec's Look and feel (cream background, brown-black text, deep green primary, 6px radius, Lora serif for headings, system sans for body), dark theme removed; `docs/design-system.md` filled; `/styleguide` baseline regenerated with the final tokens.
- Backlog: 16 features (M1: F001-F008, M2: F009-F016), all failing. Owner checks on F001, F004, F007, F009, F015.
- Decisions: `docs/decisions/0002-product-choices.md` (routes, password length, status values and URL filter, finish date and stats in UTC, 404 for missing and other users' books, fonts).
- The human approved the backlog in advance (kickoff arguments), so no stop for confirmation.
