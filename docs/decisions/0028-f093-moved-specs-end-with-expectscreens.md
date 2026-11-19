# 0028: Specs F093 moves also end with expectScreens (F093)

## Context
M9's "Specs that move" changes the steps of F030, F033, F067, F071, F083, F084 and F087's specs to reach the new
row actions menu. `scripts/e2e-size.py` requires every spec a branch changes to call `expectScreens` (light and
dark baselines, axe, touch targets), because `app/globals.css` imports `ui-base.css`. The owner ruled (2026-11-17)
that these moved specs follow the rule like any other changed spec.

## Decision
Each moved spec's page-driving tests gain one `expectScreens(page, "<id>-<what>")` call at their end state (for
F071's first test, on the empty /up-next after the book leaves the queue, since its last page is the book page, which
F093 does not own). Existing checks and baselines stay; volatile text is masked. Two touch-target misses that the new
check found in F093's own UI were fixed (the first row's Start reading button and the share link in the share dialog).
The F071 queue-order test waits for the open menu and the reordered rows between steps; its assertions are unchanged.

## Consequences
New `-light`/`-dark` baselines in those specs' folders. F083's "signed-out visitor" test fails in dev while Next
16.4.2 shows its "Security Insight" badge (two buttons) on every page; that is the Next version, not F093.
