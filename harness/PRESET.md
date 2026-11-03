# Preset: nextjs-supabase

The stack is decided (see `docs/decisions/0001-stack.md`). In `/kickoff`, this replaces steps 2 to 5:

1. Run `scripts/preset-setup.sh <app-name>`. It scaffolds Next.js next to the harness, installs pinned dependencies, sets up shadcn/ui (tokens in `app/globals.css`, base components in `components/ui/`) and local Supabase on a free port block, and adds ignores and golden principles 7 and 8.
2. Run `./scripts/check.sh` and make it pass. The first run pulls the Supabase images if this machine has none.
3. Design system: set the tokens in `app/globals.css` (colors, `--radius`; the font in `app/layout.tsx`) to match the spec's Look and feel, fill every `<...>` in `docs/design-system.md`, and look at `/styleguide`. Then delete `e2e/__screenshots__/` and run `check.sh` again, so the first baselines show the final tokens.
4. Set the date in `docs/decisions/0001-stack.md`. Record any change you make to the preset's choices as a new decision.

Then continue with `/kickoff` step 6.

## Rules that come with it
- `./init.sh` serves on `$PORT`, or on the first free port from 3300. It starts the local Supabase stack and loads `.env.test`.
- `.env.test` is generated from the local stack (`scripts/env-test.sh`); it holds local keys only and is gitignored. Agents may read it.
- Schema changes are migrations in `supabase/migrations/` (`npx supabase migration new <name>`). Never edit a migration that already landed on `main`.
- Next.js 16: `npm run lint` runs ESLint (`eslint.config.mjs`; there is no `next lint`), and `npm run typecheck` runs `next typegen` first, since the route types (`LayoutProps`, `PageProps`) are generated. Next's own `AGENTS.md` points to the version's docs in `node_modules/next/dist/docs/`; read them before using an API you are unsure of.
- Unit tests (`*.test.ts`) cover `lib/`; coverage thresholds live in `vitest.config.ts`. Pages and flows are covered by e2e tests in `e2e/`.
- E2E tests create their own users and rows with unique names, and never reset the database (golden principle 7).
- After a migration, run `npm run db:types` and commit `lib/database.types.ts`; code reads tables through those types. `check.sh` fails when they drift from the migrations.
- UI follows `docs/design-system.md`: token classes, the Tailwind scale and `components/ui/` (add one with `npx shadcn@4.21.3 add <name>`). `scripts/ui-tokens.py` fails on color literals, palette colors, arbitrary values and raw form elements.
- Each UI feature's e2e test ends with `await expect(page).toHaveScreenshot("<id>-<what>.png")` of its final state, taken after an `expect(...).toBeVisible()` on that state's content (a heading, a row) so it is never a loading fallback, with data that is the same every run (or hidden with `mask:`). Baselines in `e2e/__screenshots__/` are compared locally only. When your feature changes how another page looks, update that baseline with `npx playwright test --update-snapshots=changed` only if the change is in your acceptance; the designer reviews every changed baseline.
- Security gates in `check.sh`: `npm audit` (high and critical, shipped dependencies), Semgrep (`scripts/sast.sh`, needs `uv`), `scripts/migration-lint.py`, `scripts/rls-check.py`. A new migration has a `-- rollback:` comment; a destructive one (drop, truncate, delete, rename, type change, NOT NULL without default) needs a human decision: mark the feature `needs_human`.
- Accessibility: every e2e spec that opens a page calls `await expectAccessible(page)` (`e2e/a11y.ts`, axe-core, WCAG 2.2 AA) on each screen it checks.
- Performance budget: `scripts/perf.sh` (Lighthouse CI on a production build) runs in CI. Add each public page you build to `pages` in `lighthouserc.cjs`; set budgets from the design doc's NFR when they differ.
- `/release` runs `scripts/deploy-staging.sh`: Supabase preview branch plus Vercel preview. It needs the tokens listed at the top of that script.

## Design gates
`/design` keeps these in step with `docs/design/<M>.md`, and `check.sh` enforces them:
- **Modules:** every import rule in the doc's Modules section is a `forbidden` rule in `.dependency-cruiser.cjs` (cycles are always forbidden). Folders: `app/` pages and route handlers, `components/` UI, `lib/` logic and data access; name others in the doc.
- **Data model:** tables, constraints and RLS policies are created by migrations in `supabase/migrations/`, never by hand; `lib/database.types.ts` (generated) must match them.
- **Contract:** route handlers and server actions take and return types defined in `lib/` (built on `lib/database.types.ts`), so a change to the contract is a type change the typecheck follows.
