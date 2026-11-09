#!/usr/bin/env bash
# Prints the address of Playwright's Linux browser server, started in Docker once per machine and shared by every
# lane. e2e connects to it (PW_WS, playwright.config.ts), so a screenshot is the same pixels on a Mac and on CI's
# Linux, and the visual baselines are compared everywhere. The browser reaches this machine's localhost through
# Playwright's tunnel (exposeNetwork), so the app and Supabase stay where they are.
set -euo pipefail
cd "$(dirname "$0")/.."
v="$(node -p 'require("@playwright/test/package.json").version')"
name="harness-playwright-$v"
if [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" != true ]; then
  docker rm -f "$name" >/dev/null 2>&1 || true
  # Two lanes may start it at once: the second run fails on the name, and both then use the first one.
  docker run -d --rm --init --ipc=host --name "$name" -p 127.0.0.1::3000 --user pwuser --workdir /home/pwuser \
    "mcr.microsoft.com/playwright:v$v-noble" \
    /bin/sh -c "npx -y playwright@$v run-server --port 3000 --host 0.0.0.0" >/dev/null 2>&1 || true
fi
for _ in $(seq 1 120); do  # the first start pulls the image and the package
  addr="$(docker port "$name" 3000/tcp 2>/dev/null | head -1 || true)"
  if [ -n "$addr" ] && curl -s -o /dev/null --max-time 2 "http://$addr/"; then
    echo "ws://$addr/"
    exit 0
  fi
  sleep 1
done
echo "browser.sh: Playwright's browser server ($name) did not start; see: docker logs $name" >&2
exit 1
