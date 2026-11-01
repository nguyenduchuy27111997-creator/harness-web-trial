#!/usr/bin/env bash
# Stop hook. Only active in autonomous runs (HARNESS_AUTONOMOUS=1, set by
# harness/loop.py). Blocks the agent from ending a session with a dirty
# tree or a failing gate. Exit 2 = block; stderr is shown to Claude.
[ "${HARNESS_AUTONOMOUS:-0}" = "1" ] || exit 0
# A review session changes nothing, so there is nothing to gate. Seen for real: a review that ended its
# turn to wait for its subagents sat in check.sh until the hook timed out (10 min), three times.
[ "${HARNESS_STAGE:-}" = "review" ] && exit 0

input=$(cat)
# Block up to 8 times per session, then let it stop (no endless loop). Once is not
# enough: in a headless run a session ended its turn to "wait" for a background
# verifier, and the loop then found its work uncommitted.
session="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("session_id","x"))' 2>/dev/null)"
count_file="${TMPDIR:-/tmp}/harness-stop-gate-${session:-x}"
count=$(( $(cat "$count_file" 2>/dev/null || echo 0) + 1 ))
echo "$count" >"$count_file"
[ "$count" -gt 8 ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if ! ./scripts/check.sh >/dev/null 2>&1; then
  echo "scripts/check.sh is failing. Fix it, or revert your change and mark the feature blocked, before ending the session." >&2
  exit 2
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. If the reviewer or verifier is still running, wait for its result first (do not end your turn while a subagent runs). Then update harness/status/<id>.json and harness/log/<id>.md and commit before ending the session." >&2
  exit 2
fi
exit 0
