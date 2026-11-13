---
name: rls-probe-via-test
description: Ad-hoc curl RLS probes that source .env.local keys are denied by auto mode; use the feature's integration spec via scripts/e2e.sh
metadata:
  type: project
---

On F075 (2026-11-10), a Bash curl script that sourced .env.local and hit Supabase REST as a second user was blocked by the auto-mode classifier.

**Why:** a denied probe uses up budget and returns nothing.
**How to apply:** for cross-account RLS criteria, run the feature's integration spec (`scripts/e2e.sh e2e/<spec>`) and read which operations it asserts. Fill any gaps (e.g. a missing delete check) by reading the migration's policies, and call out the gap as a test-coverage note. See [[malformed-id-edge-case]].
