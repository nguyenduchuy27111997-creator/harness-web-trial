#!/usr/bin/env bash
# Starts local Supabase and the dev server. Run it in the background.
# Port: $PORT when set (the loop always sets it), else the first free port
# from 3300, so it never lands on another app already running on this machine.
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] && [ node_modules/.package-lock.json -nt package-lock.json ] || npm ci --silent
scripts/env-test.sh

port="${PORT:-3300}"
if [ -z "${PORT:-}" ]; then
  while lsof -nP -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do port=$((port + 1)); done
fi
set -a; . ./.env.test; set +a
echo "Serving on http://localhost:$port"
exec npx next dev --port "$port"
