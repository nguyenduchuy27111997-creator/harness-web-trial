---
name: inline-link-exemption
description: e2e expectTouchTargets skips every display:inline <a>, so standalone links (e.g. a quote's book link on /quotes) can be 18px tall and still pass the gate
metadata:
  type: project
---

`e2e/a11y.ts` expectTouchTargets exempts any `<a>` whose computed display is `inline`, meant for links in running text. A link alone on its own line (the /quotes book link under each quote, F093 2026-11-18) is inline too, so an 18px-tall target passes the gate.

**Why:** the /up-next title link had the same problem and was fixed with `flex min-h-11 ... lg:min-h-0`; the gate did not catch either.
**How to apply:** at 390px measure every visible `a`/`button` rect yourself (and `elementFromPoint` probes for pseudo-element hit areas) instead of trusting the gate. Wait ~500ms after opening a Radix menu before measuring items: the zoom-in animation scales them (44 reads as 42). See [[next-security-nudge-exit]].
