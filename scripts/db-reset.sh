#!/usr/bin/env bash
# Rebuilds the local database from supabase/migrations and supabase/seed.sql.
# For humans only: loop lanes share this database, so check.sh, tests and
# agents never reset it (golden principle 7).
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/db-up.sh
npx supabase db reset
