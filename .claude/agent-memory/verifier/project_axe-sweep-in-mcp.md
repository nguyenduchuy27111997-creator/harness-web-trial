---
name: axe-sweep-in-mcp
description: How to run axe + 44px touch-target checks across every page from the MCP browser (no spec needed)
metadata:
  type: project
---

For "every page passes accessibility / 44 px" criteria, specs usually cover only a few pages. Sweep all pages yourself in `browser_run_code_unsafe`: `page.addScriptTag({path: '<worktree>/node_modules/axe-core/axe.min.js'})` then `axe.run` with wcag2a/2aa/21a/21aa/22aa tags, per `emulateMedia({colorScheme})`; copy `expectTouchTargets` selector logic from `e2e/a11y.ts` at 375 px.

**Why:** F088 (2026-11-16) spec checked 4 pages; sweep found standalone links ("Back to my books", "Year in review", "Previous year", book-title links) under 44 px tall that `expectTouchTargets` would flag, though buttons/fields all passed.
**How to apply:** Note whether acceptance wording says "buttons and fields" vs "targets" before failing on links.
