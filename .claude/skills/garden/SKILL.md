---
name: garden
description: Entropy cleanup. Finds stale docs, golden-principle violations, duplicate helpers and dead code, and fixes them in small separate commits. Use weekly, or after every 10 or so features.
---

# Garden

Pay down drift in small pieces. Never change behavior here.

1. Make sure `./scripts/check.sh` passes first. If not, stop and report.
2. Docs: for each file in `CLAUDE.md`'s map and `docs/`, check it still matches the code. Fix stale paths, commands and claims. Delete docs that describe things that no longer exist.
3. Principles: spawn the `reviewer` subagent on the whole repo (not a diff) against `docs/golden-principles.md`. Take its top findings.
4. For each fix: one small commit (`refactor: <what>` or `docs: <what>`), `./scripts/check.sh` passing after each.
5. If a violation type appears 3 or more times, run `/learn` to enforce it mechanically.
6. Add a progress entry (feature id: `garden`).

Stop after about 10 commits. Report what was fixed and what was left.
