# 0027: Per-run text is hidden in visual baselines (F096)

## Context
M9's design puts my email in a row of the settings page (F096). Every e2e test signs up a fresh, timestamped
account, so the email differs each run. F073's and F074's end baselines are of `/settings` and have no mask, so
they could never match again; editing their specs to add one is changing another feature's test.

## Decision
An element whose text differs every run by design carries `data-volatile`, and `e2e/screenshot.css` (applied to
every `toHaveScreenshot`) gives it `visibility: hidden`: its box and layout stay in the baseline, its glyphs do
not. Only the settings email uses it. No assertion is loosened: tests still read the email through the DOM.

## Consequences
New per-run text in a page another feature screenshots gets `data-volatile` instead of a spec change.
