#!/usr/bin/env bash
# Secrets in this branch's commits and in the work not committed yet (gitleaks, as CI's Secret scan runs it on the
# whole history). Without gitleaks installed (brew install gitleaks) it says so and leaves it to CI.
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v gitleaks >/dev/null; then
  echo "secrets: gitleaks is not installed here (brew install gitleaks); CI's Secret scan still runs"
  exit 0
fi
base="$(git merge-base origin/main HEAD 2>/dev/null || true)"
if [ -n "$base" ] && [ "$base" != "$(git rev-parse HEAD)" ]; then
  gitleaks git --redact --no-banner --log-opts="$base..HEAD" .
fi
# Changed and new files not committed yet: a session runs check.sh before it commits.
{ git diff HEAD; git ls-files --others --exclude-standard -z | while IFS= read -r -d '' f; do cat -- "$f" 2>/dev/null || true; done; } \
  | gitleaks stdin --redact --no-banner
