---
name: realtime-probes
description: How to verify Supabase Realtime features (private topics, RLS, reconnect catch-up) for real, beyond the e2e spec
metadata:
  type: project
---

On F086 (2026-11-14): a node script (see [[storage-service-role-listing]] for the --env-file + createRequire setup) that signs in two users and calls `client.channel(topic, {config:{private:true}})` gives direct RLS evidence: the other user's topic returns CHANNEL_ERROR "Unauthorized", own topic gets INSERT/DELETE broadcasts. For reconnect: MCP `page.context().setOffline(true)`, insert a book via the node script while offline (45s+ so the socket times out), then go online and wait for it. Set `window.__qaMarker` beforehand to prove no reload happened.

**Why:** the F086 spec only checked the rendered list (server RLS hides other users' rows anyway) and added the book after reconnect, so it never exercised channel RLS or catch-up.
**How to apply:** for any live/realtime feature, run these probes and flag spec gaps like these.

On F086 re-verify (2026-11-16): `page.screenshot` at the default MCP viewport cuts off the /books list below the filter bar; pass `fullPage: true` so the screenshot actually shows the live rows. The spec gaps above were still there (catch-up test adds the book after going back online).

On F086 3rd verify (2026-11-16): the MCP browser kept the previous run's session, so /sign-up redirected to /books; click "Sign out" first. Toggling setOffline mid-flow logs one harmless server "⨯ Error: The destination stream errored while writing data." in the init log. The 45s offline wait came back about 10s after going online.

On F086 4th verify (2026-11-16): the auto-mode classifier denied running the node probe with `--env-file=.env.local`. What worked instead, all in MCP: second account in `browser().newContext()` adds via UI; attach `page.on('websocket')` frame capture, reload the tab, and assert no frame contains the other account's title; for offline catch-up, sign A into a separate context, `setOffline(true)` on the main context, and add from the separate one. A raw `new WebSocket` built in the page got no messages at all, so don't use it.
