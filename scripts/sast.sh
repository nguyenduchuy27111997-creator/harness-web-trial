#!/usr/bin/env bash
# Static security analysis (Semgrep, pinned) of the app's own code. Fails on any finding.
# Semgrep runs through uv (brew install uv); CI installs it. The rule sets come from the
# Semgrep registry, so this needs the network.
set -euo pipefail
cd "$(dirname "$0")/.."
SEMGREP=1.180.0
dirs=$(for d in app components lib; do [ -d "$d" ] && echo "$d"; done)
[ -n "$dirs" ] || exit 0
if command -v uvx >/dev/null; then run=(uvx "semgrep@$SEMGREP")
elif command -v pipx >/dev/null; then run=(pipx run "semgrep==$SEMGREP")
else echo "sast: install uv (brew install uv) to run Semgrep" >&2; exit 1; fi
# --no-git-ignore: also scan files not committed yet (a session runs check.sh before it commits).
# shellcheck disable=SC2086
"${run[@]}" scan --metrics=off --error --quiet --no-git-ignore \
  --config p/default --config p/owasp-top-ten --config p/nextjs $dirs
