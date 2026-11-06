#!/usr/bin/env bash
# The single quality gate (Next.js + Supabase preset): lint, typecheck, unit tests
# with coverage thresholds, duplication, module boundaries, design tokens, dependency
# audit, static security analysis, migrations and RLS, e2e rules, data contract, e2e
# (with accessibility and visual baselines), backlog. The performance budget runs in CI
# (scripts/perf.sh). Exits non-zero on any failure.
set -euo pipefail
cd "$(dirname "$0")/.."

# Reinstall when the lockfile is newer than the installed tree (fresh worktrees have none).
# Next.js dev servers running from this folder (the verifier's ./init.sh, a lane's own server).
dev_servers_here() {
  local here="$PWD"
  (cd / && lsof -a -d cwd -Fpn 2>/dev/null | awk -v w="$here/" '/^p/ {p = substr($0, 2)} /^n/ {if (index(substr($0, 2) "/", w) == 1) print p}') \
    | while read -r pid; do
        [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ] && continue
        ps -o command= -p "$pid" 2>/dev/null | grep -qE "next (dev|start)|next-server" && echo "$pid"
      done || true  # lsof exits non-zero on unreadable entries: never let that fail the gate
}

if ! { [ -d node_modules ] && [ node_modules/.package-lock.json -nt package-lock.json ]; }; then
  # npm ci deletes node_modules: a dev server still running from here would serve half-installed
  # modules, and e2e then fails on Fast Refresh full reloads. Stop it first; Playwright starts a fresh one.
  for pid in $(dev_servers_here); do kill "$pid" 2>/dev/null || true; done
  npm ci --silent
fi

npm run --silent lint
npm run --silent typecheck
npx vitest run --coverage --passWithNoTests     # thresholds in vitest.config.ts
npx jscpd --config .jscpd.json .                # duplication budget in .jscpd.json
npx depcruise --config .dependency-cruiser.cjs . # module boundaries from docs/design/<M>.md
python3 scripts/ui-tokens.py                    # design tokens only (docs/design-system.md)
npm audit --omit=dev --audit-level=high         # no known high or critical advisory in what ships
scripts/sast.sh                                 # Semgrep: OWASP, Next.js, secrets
python3 scripts/migration-lint.py               # new migrations keep data and say how to roll back
python3 scripts/rls-check.py                    # every public table has row level security
python3 scripts/e2e-size.py                     # golden principles 6 and 9
scripts/env-test.sh                             # local Supabase up, .env.test written
scripts/db-types.sh --check                     # lib/database.types.ts matches the migrations
# With no dev server running from here, start e2e from a clean dev cache: a stale .next/dev kept F015's
# e2e in Fast Refresh reload loops, and agents may not rm -rf it themselves.
[ -n "$(dev_servers_here)" ] || rm -rf .next/dev
# One e2e suite at a time on this machine (lanes, the verifier): two at once time out under load.
python3 scripts/one-at-a-time.py e2e npx playwright test  # includes the visual baselines (e2e/__screenshots__/)

python3 harness/validate_backlog.py
python3 harness/quality.py || true             # the office's numbers, only in the loop ($HARNESS_QUALITY)
