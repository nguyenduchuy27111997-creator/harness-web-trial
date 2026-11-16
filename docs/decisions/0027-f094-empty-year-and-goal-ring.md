# 0027: F094 empty year keeps the chart; goal ring stays on /stats

Date: 2026-11-17 · Status: accepted · Scope: F094, refines the `/stats` UI in `docs/design/M9.md`

## Context
Design M9 says an empty year shows "No books finished in <year>" with a "Go to my books" link *instead of the tiles and chart*. The older specs that must keep passing read the chart on an empty `/stats` (`e2e/F059-monthly-chart.spec.ts`, "with no books finished this year every month shows 0") and the "this year" sentences ("Books finished this year: 0", "Average rating: No ratings yet", "0 pages read this year").

## Decision
- `/stats`, empty year: the tiles are replaced by the message and link; the "this year" sentences stay as screen-reader text; the monthly chart stays, its bars replaced by one muted line "Books you finish this year show up here." (months and counts kept). The goal ring and form stay.
- `/stats/[year]`: tiles and chart under the review's opening sentence; an empty year shows the message and link instead. The average tile uses the review's average (`summarizeYear`), so it matches the "Average rating" sentence on the same page. There is no goal ring there: goals are per current year and only `/stats` sets them.
- `GoalRing({ finished, goal })` lives in `components/goal-ring.tsx` and renders "<finished> of <goal> books finished this year" beside the ring; it sits above the goal form under 768 px and beside it from `md`.
- The "Set goal" field is labelled by the prompt sentence (no separate "Reading goal" label); "Change goal" keeps its "Reading goal" label.
