#!/usr/bin/env bash
# The data contract: lib/database.types.ts is generated from the local schema, so the
# code typechecks against the tables the migrations really create.
#   scripts/db-types.sh           write lib/database.types.ts (npm run db:types)
#   scripts/db-types.sh --check   fail if it differs from the schema (scripts/check.sh)
# Needs the local Supabase stack (scripts/env-test.sh starts it). A project without
# migrations has no schema yet and nothing to check.
set -euo pipefail
cd "$(dirname "$0")/.."
ls supabase/migrations/*.sql >/dev/null 2>&1 || exit 0
types="$(npx supabase gen types --lang typescript --local --schema public)"
if [ "${1:-}" = "--check" ]; then
  if [ "$types" != "$(cat lib/database.types.ts 2>/dev/null)" ]; then
    echo "lib/database.types.ts does not match the migrations: run npm run db:types and commit it." >&2
    exit 1
  fi
else
  mkdir -p lib
  printf '%s\n' "$types" >lib/database.types.ts
fi
