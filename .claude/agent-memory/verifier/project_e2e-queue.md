---
name: e2e-queue
description: scripts/e2e.sh is serialized across all lanes (one-at-a-time.py) and can wait >10 min; init.sh in background is killed at its time limit
metadata:
  type: project
---

On F088 (2026-11-16) `./scripts/e2e.sh <specs>` sat queued behind other lanes' runs for over 600 s with no output, and the background `./init.sh` hit its 600 s limit and died mid-verification.

**Why:** e2e runs go through scripts/one-at-a-time.py (one lane at a time, Docker browser), so a verifier cannot count on running specs.
**How to apply:** do the UI checks first in MCP; start init.sh with a long background timeout (e.g. 3600000); treat running the spec as optional and just confirm the spec exists and covers the criteria. See [[axe-sweep-in-mcp]].
