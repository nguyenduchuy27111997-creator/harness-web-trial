#!/usr/bin/env bash
# Writes .env.test from the local Supabase stack: local keys only, never a real
# project's. Gitignored. Agents may read it; Playwright and init.sh load it.
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/db-up.sh
npx supabase status -o env 2>/dev/null | python3 scripts/supabase_env.py local >".env.test.$$"
mv ".env.test.$$" .env.test  # one temp file per run: init.sh and check.sh may run this at once
