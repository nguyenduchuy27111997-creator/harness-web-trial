---
name: partial-node-modules
description: init.sh can fail "next: command not found" because a half-installed node_modules has a fresh .package-lock.json, so init skips npm ci
metadata:
  type: project
---

init.sh only runs `npm ci` when node_modules/.package-lock.json is older than package-lock.json. A lane's node_modules was once partial (151 dirs, no .bin/next, eslint missing) yet newer than the lockfile, so init.sh exited 127 "next: command not found" and check.sh failed "eslint: command not found".

**Why:** an interrupted install by the coder session (adding a dependency) leaves the marker file fresh.
**How to apply:** if init.sh exits 127, check `ls node_modules/.bin/next`; run `npm ci` (what init.sh would do), then rerun init.sh (expect the Next nudge exit once, see [[next-security-nudge-exit]]). For two-tab realtime list checks, record in the list tab and bringToFront it after acting in the other tab; background tabs throttle rAF.
