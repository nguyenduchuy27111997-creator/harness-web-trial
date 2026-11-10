---
name: mcp-upload-roots
description: Playwright MCP file upload only accepts files under the worktree; put upload fixtures in the gitignored .playwright-mcp dir
metadata:
  type: project
---

The Playwright MCP's browser_file_upload / setInputFiles rejects paths outside the worktree (scratchpad under /private/tmp is refused).

**Why:** MCP allowed roots are the worktree and its `.playwright-mcp` output dir.
**How to apply:** for import/upload features, write fixtures into `<worktree>/.playwright-mcp/` (gitignored), then delete them afterwards. Use page.locator('input[type=file]').setInputFiles in browser_run_code_unsafe to skip the file chooser. Also: macOS has no `timeout` command. See [[mcp-no-downloads]].
