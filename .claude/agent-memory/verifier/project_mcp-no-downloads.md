---
name: mcp-no-downloads
description: The Playwright MCP browser never fires download events (even for blob anchors); verify file downloads another way
metadata:
  type: project
---

The Playwright MCP browser in this harness does not emit `download` events, even for a plain blob `<a download>`. Seen on F068 (CSV export), 2026-11-10.

**Why:** a timeout on `waitForEvent('download')` looks like an app bug but comes from the tool.

**How to apply:** for download features, check headers and body with an in-page `fetch` (it carries the session cookies), then run the feature's e2e spec via `scripts/e2e.sh <spec>`, which uses the Docker browser where downloads work.
