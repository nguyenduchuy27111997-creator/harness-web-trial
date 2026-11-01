#!/usr/bin/env bash
# Staging = a persistent Supabase preview branch + a Vercel preview deployment.
# Never production: no --prod, and the branch is not the main database.
# Called by /release. Prints the staging URL as its last line.
#
# Needs: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF (branching enabled on the
# project), VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.
# Optional: STAGING_BRANCH (default: staging), STAGING_SEED=1 to load supabase/seed.sql.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}" "${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF}"
: "${VERCEL_TOKEN:?set VERCEL_TOKEN}" "${VERCEL_ORG_ID:?set VERCEL_ORG_ID}" "${VERCEL_PROJECT_ID:?set VERCEL_PROJECT_ID}"
branch="${STAGING_BRANCH:-staging}"
ref="$SUPABASE_PROJECT_REF"
vercel=(npx -y vercel@62.0.0)
err="$(mktemp)"

# 1. The Supabase branch: create it once, then wait until it reports a database URL.
if ! npx supabase branches get "$branch" --project-ref "$ref" >/dev/null 2>&1; then
  echo "Creating Supabase branch $branch" >&2
  npx supabase branches create "$branch" --persistent --project-ref "$ref" >&2
fi
for _ in $(seq 60); do
  if exports="$(npx supabase branches get "$branch" --project-ref "$ref" -o env 2>/dev/null \
      | python3 scripts/supabase_env.py branch 2>"$err")"; then break; fi
  sleep 10
done
if [ -z "${exports:-}" ]; then cat "$err" >&2; exit 1; fi
eval "$exports"

# 2. Schema (and seed if asked) onto the branch.
npx supabase db push --db-url "$DATABASE_URL" ${STAGING_SEED:+--include-seed} >&2

# 3. A Vercel preview build pointing at the branch.
export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
"${vercel[@]}" pull --yes --environment=preview --token "$VERCEL_TOKEN" >&2
"${vercel[@]}" build --token "$VERCEL_TOKEN" >&2
url="$("${vercel[@]}" deploy --prebuilt --token "$VERCEL_TOKEN" \
  --env NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --env NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY")"
echo "$url"
