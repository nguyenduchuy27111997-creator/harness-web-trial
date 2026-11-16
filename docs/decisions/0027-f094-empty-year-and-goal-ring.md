# 0027: F094 empty year keeps the chart; goal ring stays on /stats

Date: 2026-11-17 · Status: accepted · Scope: F094, refines the `/stats` UI in `docs/design/M9.md`

## Context
Design M9 says an empty year shows "No books finished in <year>" with a "Go to my books" link *instead of the tiles and chart*. The older specs that must keep passing read the chart on an empty `/stats` (`e2e/F059-monthly-chart.spec.ts`, "with no books finished this year every month shows 0") and the "this year" sentences ("Books finished this year: 0", "Average rating: No ratings yet", "0 pages read this year").

## Decision
- `/stats`, empty year: the tiles are replaced by the message and link; the "this year" sentences stay as screen-reader text; the monthly chart stays with its 12 month rows at 0 and no bars (no extra line), so F059 still reads every month as 0. The goal ring and form stay under an h2 "Reading goal".
- `/stats/[year]`: tiles and chart under the review's opening sentence; an empty year shows only the empty state (the "You finished no books in <year>." sentence stays as screen-reader text, since F061 and F063 read it). The average tile uses the review's average (`summarizeYear`), so it matches the "Average rating" sentence on the same page. There is no goal ring there: goals are per current year and only `/stats` sets them.
- `GoalRing({ finished, goal })` lives in `components/goal-ring.tsx` and renders "<finished> of <goal> books finished this year" beside the ring; it sits above the goal form under 768 px and beside it from `md`.
- The "Set goal" field is labelled by the prompt sentence (no separate "Reading goal" label); "Change goal" keeps its "Reading goal" label.
- The empty state is one block (`components/empty-year.tsx`): an h2 "No books finished in <year>" in the section style, then "Go to my books" as a `Button` (asChild `Link`). "Year in review" sits in the `/stats` header row, trailing the "Stats" title.
