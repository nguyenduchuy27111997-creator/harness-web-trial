#!/usr/bin/env bash
# SessionStart hook: stdout is added to Claude's context, so every session
# starts knowing where the last one stopped.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f harness/features.json ] || exit 0

# Point git at the harness pre-commit hook (integrity guard, gitleaks) unless
# the project already uses its own hooks path.
if git rev-parse --git-dir >/dev/null 2>&1 && [ -z "$(git config core.hooksPath)" ]; then
  git config core.hooksPath .githooks
fi

# A loop lane works on one job (HARNESS_LANE): show only that, not the whole queue.
if [ -n "${HARNESS_LANE:-}" ]; then
  status="$(python3 harness/next_feature.py --status "$HARNESS_LANE" 2>/dev/null)"
  if [ -n "$status" ] && [ "$status" != missing ]; then  # a feature, not a design, rule or revert job
    echo "## This lane's feature: $HARNESS_LANE ($status)"
    if [ -f "harness/log/$HARNESS_LANE.md" ]; then echo "### Log of $HARNESS_LANE"; head -20 "harness/log/$HARNESS_LANE.md"; fi
  fi
  exit 0
fi

echo "## Harness state"
echo "Failing features: $(python3 harness/next_feature.py --count)"
echo
echo "### Next feature"
python3 harness/next_feature.py || true
echo
next_id="$(python3 harness/next_feature.py --id 2>/dev/null)"
if [ -n "$next_id" ] && [ -f "harness/log/$next_id.md" ]; then
  echo "### Log of $next_id"
  head -20 "harness/log/$next_id.md"
fi
