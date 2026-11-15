---
name: m9-review-checks
description: Checks that caught real problems in the M9 redesign design review (dark token ordering, untouched top-level screens)
metadata:
  type: project
---
M9 (redesign on docs/ui-guide.md) design review, round 2 (2026-11-16) still failed on things easy to miss:
- Dark token lightness order: a "selected" surface (bg-card L0.23) placed on a track (bg-muted L0.26) is darker than its track, so it reads recessed. Compare the actual L numbers of every nested surface pair in dark.
- "Anything not listed keeps its layout" hid /up-next, a top-level tab-bar destination still built as a Card per row (section 10 smell).

**Why:** the doc's prose claimed "lighter" while its own token values said otherwise; catch-all sentences skip screens.
**How to apply:** in design reviews, list every route under app/ and check each top-level destination has a screen entry; check nested-surface L values numerically in dark.
