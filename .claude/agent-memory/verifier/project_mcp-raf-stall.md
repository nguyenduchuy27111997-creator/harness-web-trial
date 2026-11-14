---
name: mcp-raf-stall
description: The MCP browser tab can stop running requestAnimationFrame, so every click times out on "waiting for element to be ... stable"; open a new tab
metadata:
  type: project
---

On F081 (2026-11-14), after several reloads, every click in the MCP tab timed out on "waiting for element to be visible, enabled and stable", even though the element was visible, enabled and on top. A rAF probe in browser_evaluate never fired. Resizing did not help.

**Why:** Playwright's stability check needs animation frames. The stall comes from the tool, not the app, and is easy to mistake for an app bug.
**How to apply:** if clicks hang, check `requestAnimationFrame` with a 2 s timeout. If it never fires, open the same URL with browser_tabs new and close the old tab. Cookies carry over. See [[mcp-upload-roots]].
