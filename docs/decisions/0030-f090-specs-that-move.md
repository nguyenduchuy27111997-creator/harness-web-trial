# 0030: F090's library view moves the steps of the F013, F086, F088 and F082 specs

Date: 2026-11-20 · Feature: F090 · Milestone: M9

## Context
CI held F090's PR on specs owned by other features. M9's empty shelf shows the Add book state with no "Book filter" nav, but status-filter (F013), F086-live-list (3 tests) and F088 "pages follow the system" check that nav on an empty shelf. The 1280 px grid draws 173 px covers with a CSS initial, but F082-cover-display expects a 40x60 thumbnail and finds the letter with `getByText("Z")`. F064-list-tags failed for a different reason, a real overflow bug: the title link could grow wider than its grid cell. That one is fixed in code (`max-w-full` on the link), not by moving a spec.

## Decision
These specs go into M9's `## Specs that move` under F090. Only their setup steps change. status-filter checks "All" after the first book is added. F086 and F088 add one seed book before they open /books. F082 sets a 390x844 viewport before it opens /books, where the row thumbnail is still 40x60, and its placeholder-size step climbs from the letter to the `cover-placeholder` box instead of the letter's own element (now the span). The row placeholder draws its initial as a real `<span aria-hidden>` (hidden from 1024 px), and the grid keeps the CSS `::before` initial, so the cells F034 reads still start with the title. Every check stays as it was.

## Consequences
The F082-cover-display and F086-live-list baselines are redrawn (phone width for one, a seed book on the shelf for the other). status-filter's F013-finished-tab is redrawn too: it still showed the pre-M9 layout, because the spec failed before reaching it. F064-list-tags is redrawn because the old image had the overflowing title baked in. Rejected: showing the filter on an empty shelf, because M9 asks for the empty state alone.
