#!/usr/bin/env bash
# One-time setup for the Next.js + Supabase preset, run by /kickoff (or /adopt on
# an existing Next.js app). Safe to re-run: every step skips what is already there.
#
# Usage: scripts/preset-setup.sh [app-name]     (default: the folder name)
set -euo pipefail
cd "$(dirname "$0")/.."
name="$(printf '%s' "${1:-$(basename "$PWD")}" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-' '-' | sed 's/^-*//; s/-*$//')"

# Versions this preset was last tested with (the kit's real loop runs).
CREATE_NEXT_APP=16.4.2
SHADCN=4.21.3
# vite and @types/node are vitest 5 peers that npm does not add on its own
# (a real setup failed with "Cannot find package 'vite'").
DEV_DEPS="@lhci/cli@0.15.1 @axe-core/playwright@4.13.0 @playwright/test@1.64.0 vitest@5.0.3 @vitest/coverage-v8@5.0.3 vite@8.3.1 @types/node@24.19.0 jscpd@5.4.0 dependency-cruiser@18.4.0 supabase@2.119.0"
DEPS="next@16.4.2 @supabase/supabase-js@2.117.2"
DEV_DEPS="$DEV_DEPS eslint-config-next@16.4.2"

# 1. Next.js app. create-next-app refuses a folder that already has the harness in
#    it, so scaffold aside and copy in without overwriting anything.
if [ ! -f package.json ]; then
  tmp="$(mktemp -d)"
  npx -y "create-next-app@$CREATE_NEXT_APP" "$tmp/app" --ts --eslint --app --tailwind --no-src-dir \
    --use-npm --import-alias "@/*" --skip-install --disable-git --yes >/dev/null
  (cd "$tmp/app" && find . -type f) | while read -r f; do
    if [ ! -e "$f" ]; then mkdir -p "$(dirname "$f")"; cp "$tmp/app/$f" "$f"; fi
  done
  # shadcn/ui's tokens read the font from --font-sans; the dev badge would show up in
  # every screenshot and visual baseline. Geist Mono goes: no page uses it, and its download
  # pushed /styleguide's LCP over the 2500 ms budget in the web trial's CI (2618 ms).
  sed -i.bak -e 's/--font-geist-sans/--font-sans/' -e "s/Create Next App/$name/" \
    -e 's/import { Geist, Geist_Mono }/import { Geist }/' -e '/^const geistMono = Geist_Mono({$/,/^$/d' \
    -e 's/ ${geistMono.variable}//' app/layout.tsx && rm app/layout.tsx.bak
  sed -i.bak 's|/\* config options here \*/|devIndicators: false, // keeps the dev badge out of screenshots|' next.config.ts && rm next.config.ts.bak
  # The generator's demo page uses raw colors and arbitrary values (scripts/ui-tokens.py).
  cat >app/page.tsx <<'PAGE'
export default function Home() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">Welcome</h1>
      <p className="text-muted-foreground">Replace this page with the first feature.</p>
    </main>
  );
}
PAGE
fi

# 2. Pinned dependencies and scripts.
# shellcheck disable=SC2086
npm install --save-exact --silent $DEPS
# shellcheck disable=SC2086
npm install --save-exact --save-dev --silent $DEV_DEPS
npm pkg set scripts.typecheck="next typegen && tsc --noEmit" scripts.test:unit="vitest run --coverage" \
  scripts.test:e2e="playwright test" scripts.db:reset="scripts/db-reset.sh" \
  scripts.db:types="scripts/db-types.sh"
node -p 'process.versions.node.split(".")[0]' >.nvmrc

# 2b. Design system: shadcn/ui with its tokens as CSS variables in app/globals.css, and
#     the base components app/styleguide/page.tsx shows (docs/design-system.md).
if [ ! -f components.json ]; then
  npx -y "shadcn@$SHADCN" init -y -d --base radix --no-monorepo --no-rtl button input label card >/dev/null
  # init adds the shadcn CLI as a runtime dependency; it is a build-time one (npm audit --omit=dev).
  npm pkg delete dependencies.shadcn && npm install --save-exact --save-dev --silent "shadcn@$SHADCN"
  # The default light muted text and destructive red fail WCAG AA contrast (axe-core, e2e/a11y.ts).
  sed -i.bak -e 's/--muted-foreground: oklch(0.556 0 0);/--muted-foreground: oklch(0.5 0 0);/' \
    -e 's/--destructive: oklch(0.577 0.245 27.325);/--destructive: oklch(0.5 0.21 27.325);/' \
    -e 's/--font-mono: var(--font-geist-mono);/--font-mono: ui-monospace, monospace;/' app/globals.css
  rm app/globals.css.bak
fi

# 3. Local Supabase on its own block of ports. Another project's stack may already
#    use the default 5432x block, and this one must never collide with it.
if [ ! -f supabase/config.toml ]; then
  npx supabase init >/dev/null
  [ -f supabase/seed.sql ] || printf -- '-- Rows every environment needs (lookup tables, a demo org).\n-- Tests create their own data; see golden principle 7.\n' >supabase/seed.sql
  for n in 5 6 7 8 9; do
    busy=0
    for p in $(seq "5${n}320" "5${n}329"); do
      if lsof -nP -tiTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then busy=1; break; fi
    done
    if [ "$busy" -eq 0 ]; then
      sed -i.bak -E "s/= 54(3[0-9][0-9])([^0-9]|$)/= 5${n}\1\2/" supabase/config.toml && rm supabase/config.toml.bak
      echo "Local Supabase ports: 5${n}320-5${n}329"
      break
    fi
  done
fi

# 4. Name the health route after this app.
for f in app/api/harness-health/route.ts e2e/harness-health.spec.ts; do
  sed -i.bak "s/__APP_NAME__/$name/" "$f" && rm "$f.bak"
done

# 5. Ignore generated files. .playwright-mcp/ holds the verifier's browser logs; a
#    loop lane once committed them.
touch .gitignore
for line in .playwright-mcp/ test-results/ playwright-report/ coverage/ .env.test .vercel/ supabase/.temp/ .lighthouseci/; do
  grep -qxF "$line" .gitignore || printf '%s\n' "$line" >>.gitignore
done

# 6. The preset's extra golden principle.
if ! grep -q "never reset or truncate" docs/golden-principles.md; then
  cat >>docs/golden-principles.md <<'EOF'

7. **E2E tests never reset or truncate the database.** Loop lanes share one local Supabase stack, so a test creates the rows and users it needs, with names unique to the test (for example suffixed with `$HARNESS_LANE` and a timestamp), and leaves other rows alone. Only a human runs `npm run db:reset`. Enforced by: `reviewer` subagent.
EOF
fi

if ! grep -q "Design tokens and base components only" docs/golden-principles.md; then
  cat >>docs/golden-principles.md <<'EOF'

8. **Design tokens and base components only.** UI code uses the token classes (`bg-primary`, `text-muted-foreground`), the Tailwind scale and `components/ui/`, as `docs/design-system.md` says: no color literals, palette colors, arbitrary values or raw form elements. Enforced by: `scripts/ui-tokens.py` in `check.sh`, the `designer` subagent, and the visual baselines in `e2e/__screenshots__/`.
EOF
fi

if ! grep -q "Accessible to everyone" docs/golden-principles.md; then
  cat >>docs/golden-principles.md <<'EOF'

9. **Accessible to everyone.** Every screen meets WCAG 2.2 AA: labels, alt text, contrast, keyboard use. Enforced by: `expectAccessible(page)` (axe-core) in every e2e spec that opens a page, checked by `scripts/e2e-size.py`; Lighthouse in `scripts/perf.sh`; the `designer` subagent.

10. **Migrations keep data.** A schema change is a new migration with a `-- rollback:` comment; never edit one on `main`; expand and backfill first, drop later. Destructive changes need a human decision in `docs/decisions/`. Every public table has row level security. Enforced by: `scripts/migration-lint.py` and `scripts/rls-check.py` in `check.sh`, the `security-reviewer` subagent.
EOF
fi

echo "Preset ready for $name. Next: scripts/check.sh"
