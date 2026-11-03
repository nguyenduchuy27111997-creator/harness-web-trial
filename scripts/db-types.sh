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

# Every worktree and loop lane shares the one stack, so its public schema can hold another branch's
# tables (seen in the web trial). Generate from a scratch database in the same Postgres instead: the
# stack's own schemas (auth, storage, ...) and then this branch's migrations alone.
project="$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml | head -1)"
container="supabase_db_$project"
scratch="types_$(date +%s)_$$"
url="$(npx supabase status -o env | sed -n 's/^DB_URL="\(.*\)"/\1/p')"
sql() { docker exec -i "$container" psql -qX -v ON_ERROR_STOP=1 "$@"; }
sql -U supabase_admin -d postgres -c "create database $scratch owner postgres" >/dev/null
trap 'sql -U supabase_admin -d postgres -c "drop database if exists $scratch with (force)" >/dev/null' EXIT
docker exec "$container" sh -c "pg_dump -U supabase_admin --schema-only --exclude-schema=public -d postgres \
  | psql -qX -U supabase_admin -d $scratch" >/dev/null
for f in supabase/migrations/*.sql; do
  sql -U postgres -d "$scratch" <"$f" >/dev/null
done
types="$(npx supabase gen types --lang typescript --db-url "${url%/*}/$scratch" --schema public)"
if [ "${1:-}" = "--check" ]; then
  if [ "$types" != "$(cat lib/database.types.ts 2>/dev/null)" ]; then
    echo "lib/database.types.ts does not match the migrations: run npm run db:types and commit it." >&2
    exit 1
  fi
else
  mkdir -p lib
  printf '%s\n' "$types" >lib/database.types.ts
fi
