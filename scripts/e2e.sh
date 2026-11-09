#!/usr/bin/env bash
# e2e in Playwright's Linux browser in Docker (scripts/browser.sh), so the visual baselines are the same pixels on
# a Mac and on CI. With arguments, they go to `playwright test` as they are (specs, --update-snapshots=changed).
# Without, HARNESS_E2E picks what runs:
#   all      every spec (the default)
#   feature  the loop: this feature's specs (e2e/$HARNESS_FEATURE*.spec.ts) and the specs this branch added or
#            changed. CI runs the whole suite before merge. In the web trial the whole suite on the Mac (load
#            18-90 on 12 CPUs) was the heaviest part of every session.
#   shard    CI: the slice $HARNESS_SHARD (for example 2/4)
#   skip     nothing (CI's main job, when the e2e job runs the suite)
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${HARNESS_E2E:-all}"
args=("$@")
if [ ${#args[@]} -eq 0 ]; then
  case "$mode" in
    skip) echo "e2e: not here (HARNESS_E2E=skip; the e2e job runs it)"; exit 0 ;;
    shard) args=(--shard="${HARNESS_SHARD:?HARNESS_SHARD, for example 1/4}") ;;
    feature)
      base="$(git merge-base origin/main HEAD 2>/dev/null || git rev-parse HEAD)"
      specs="$( { ls e2e/"${HARNESS_FEATURE:-none}"[-.]*spec.ts 2>/dev/null || true
                  git diff --name-only --diff-filter=AMR "$base" -- 'e2e/*.spec.ts'
                  git ls-files --others --exclude-standard -- 'e2e/*.spec.ts'; } | sort -u)"
      if [ -z "$specs" ]; then
        echo "e2e: no spec of ${HARNESS_FEATURE:-this feature} here; CI runs the whole suite"
        exit 0
      fi
      while read -r s; do [ -f "$s" ] && args+=("$s"); done <<<"$specs"
      echo "e2e: ${#args[@]} spec(s) of ${HARNESS_FEATURE:-this branch}; CI runs the whole suite"
      ;;
    all) ;;
    *) echo "e2e: HARNESS_E2E is all, feature, shard or skip, not '$mode'" >&2; exit 2 ;;
  esac
fi
scripts/env-test.sh  # local Supabase up, .env.test written
PW_WS="$(scripts/browser.sh)"
export PW_WS
# One e2e suite at a time on this machine (lanes, the verifier): two at once time out under load.
# A test that failed runs once more, alone on one worker, before it fails the gate: in M6 of the web trial
# (load 25-45 on 12 CPUs) F057's and F058's fixes each lost two rounds to 30 s timeouts in unrelated specs,
# different ones each run, that passed run on their own. A real failure fails again and is what gets reported.
python3 scripts/one-at-a-time.py e2e bash -c 'npx playwright test "$@" || {
  echo "e2e: rerunning only the failed tests, one worker"; npx playwright test --last-failed --workers=1; }' e2e ${args[@]+"${args[@]}"}
