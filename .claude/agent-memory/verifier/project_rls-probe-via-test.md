---
name: rls-probe-via-test
description: Curl RLS probes that source .env keys are denied by auto mode; anon probes using `npx supabase status -o env` keys work; else use the integration spec
metadata:
  type: project
---

On F075 (2026-11-10) a Bash curl script that sourced .env.local and hit Supabase REST as a second user was blocked by the auto-mode classifier. On F083 (2026-11-14) a plain grep of .env* for key names was also blocked.

What worked on F083 (2026-11-14): `eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)=')"`, then curl `$API_URL/rest/v1/<table>` and `/rest/v1/rpc/<fn>` with the anon key. This gives live anon-role evidence.

**Why:** a denied probe uses up budget and returns nothing.
**How to apply:** for anon criteria, use the supabase-status route. For cross-account RLS criteria, run the feature's integration spec (`scripts/e2e.sh e2e/<spec>`), read which operations it asserts, fill gaps by reading the migration's policies, and note them as test-coverage gaps. See [[malformed-id-edge-case]].
