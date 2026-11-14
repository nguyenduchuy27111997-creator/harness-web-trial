---
name: mcp-upload-roots
description: Playwright MCP file upload only accepts files under the worktree; easiest is an in-memory buffer built from a canvas, no fixture file needed
metadata:
  type: project
---

The Playwright MCP's browser_file_upload / setInputFiles rejects paths outside the worktree (scratchpad under /private/tmp is refused). Writing a fixture with Bash may also be denied by permissions.

**Why:** MCP allowed roots are the worktree and its `.playwright-mcp` output dir; the verifier must not write files.
**How to apply:** in browser_run_code_unsafe, build the image in the page (`canvas.toDataURL('image/png')`), then `Buffer.from(b64,'base64')` (Buffer exists there; `require` does not) and `page.locator('input[type=file]').setInputFiles({name, mimeType, buffer})`. Worked on F082 (2026-11-14). Also: macOS has no `timeout` command. See [[mcp-no-downloads]].
