#!/usr/bin/env bash
# Performance budget: Lighthouse CI on a production build, budgets in lighthouserc.cjs.
# CI runs it after check.sh; run it locally after changing a page's weight or loading.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.test ] && set -a && . ./.env.test && set +a
npx next build >/dev/null
export PORT="${PORT:-3300}"
npx lhci autorun
