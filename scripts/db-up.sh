#!/usr/bin/env bash
# Starts this project's local Supabase stack if it is not running. Every worktree
# and loop lane shares the one stack (same project_id), so a lock in the shared
# git dir keeps two lanes from starting it at once. Never stops another project's stack.
set -euo pipefail
cd "$(dirname "$0")/.."

# Without a Docker daemon `supabase status` hangs instead of failing (seen after the Mac slept), and
# check.sh with it, until a hook times out. Fail at once with the reason instead.
if ! docker info >/dev/null 2>&1; then
  echo "db-up: Docker is not running. Start Docker Desktop, then run this again." >&2
  exit 1
fi

lock="$(git rev-parse --git-common-dir)/supabase-start.lock"
until mkdir "$lock" 2>/dev/null; do sleep 1; done
trap 'rmdir "$lock"' EXIT

if ! npx supabase status >/dev/null 2>&1; then
  npx supabase start -x studio,imgproxy,vector,edge-runtime,analytics >/dev/null
fi
