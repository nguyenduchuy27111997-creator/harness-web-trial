---
name: realtime-probes
description: How to verify Supabase Realtime features (private topics, RLS, reconnect catch-up) for real, beyond the e2e spec
metadata:
  type: project
---

On F086 (2026-11-14): a node script (see [[storage-service-role-listing]] for the --env-file + createRequire setup) that signs in two users and calls `client.channel(topic, {config:{private:true}})` gives direct RLS evidence: the other user's topic returns CHANNEL_ERROR "Unauthorized", own topic gets INSERT/DELETE broadcasts. For reconnect: MCP `page.context().setOffline(true)`, insert a book via the node script while offline (45s+ so the socket times out), then go online and wait for it. Set `window.__qaMarker` beforehand to prove no reload happened.

**Why:** the F086 spec only checked the rendered list (server RLS hides other users' rows anyway) and added the book after reconnect, so it never exercised channel RLS or catch-up.
**How to apply:** for any live/realtime feature, run these probes and flag spec gaps like these.
