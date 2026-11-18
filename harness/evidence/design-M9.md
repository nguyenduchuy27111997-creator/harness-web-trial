<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-17T02:41:18 on bfd5c96 plus working tree
- Architect run: a845724cc5625df19
- Design sha256: d0b44f881722e88e6b1de4ab5b55382010eaa973e28484384c6d96903ecffe43

VERDICT: PASS
DESIGN: M9
CHECKED:
- Scope: the only change in this round is the "Empty year" sentence in the `/stats` and `/stats/[year]` (F094) bullet of /Users/huynguyen/Desktop/harness-web-trial-loop/F094/docs/design/M9.md. I checked it against decision 0027, F094, the F059 spec and the code, and did not re-review the rest of M9.
- Consistency with decision 0027 (/Users/huynguyen/Desktop/harness-web-trial-loop/F094/docs/decisions/0027-f094-empty-year-and-goal-ring.md): the doc now cites 0027 by name. Both say the same thing. On `/stats`, an empty year replaces the tiles with the empty state ("No books finished in <year>" plus a "Go to my books" button), keeps the chart at all-zero counts, and keeps the goal ring and form. On `/stats/[year]`, an empty year shows only the empty state. The earlier wording ("instead of the tiles and chart") is gone, and 0027's Context explains why it changed.
- Locked spec F059 (/Users/huynguyen/Desktop/harness-web-trial-loop/F094/e2e/F059-monthly-chart.spec.ts): "every month shows 0" expects a "Finished by month" region with exactly 12 list items, each reading `^<Mon>\s*0$`. The design keeps the chart at all-zero counts on an empty `/stats`. /Users/huynguyen/Desktop/harness-web-trial-loop/F094/components/monthly-chart.tsx matches: the extra muted line is removed, and when every month is 0 the bar `div` is left out, so each `li` holds only the month label and its 0 count.
- Code agrees with the doc:
  - /Users/huynguyen/Desktop/harness-web-trial-loop/F094/app/stats/(overview)/page.tsx renders `EmptyYear` instead of `StatsTiles` when finishedThisYear is 0, always renders `MonthlyChart`, and keeps the goal section.
  - /Users/huynguyen/Desktop/harness-web-trial-loop/F094/app/stats/[year]/page.tsx renders only `EmptyYear` for an empty year, with no tiles and no chart.
  - /Users/huynguyen/Desktop/harness-web-trial-loop/F094/components/empty-year.tsx is an h2 plus a `Button asChild` `Link` to /books, so "button" in the doc is accurate.
  - The "You finished no books in <year>." sentence stays as sr-only text in year-review.tsx, as 0027 says.
- Features and spec: F094's acceptance (tiles, accent bars, goal ring, phone layout) has nothing about empty years, so the change conflicts with none of it. The only empty state in the spec is the one for an empty book list, which this change does not touch.
- Contract, data model, modules: unchanged by this sentence. Only existing `lib/stats` functions are used.
- Simplicity: removing the extra empty-chart line makes the design simpler. Nothing speculative was added.
- Outside the design doc: F094's `touches` in harness/features.json does not list `components/empty-year.tsx` or `components/year-review.tsx`. If the loop enforces `touches`, that may matter, but it is a backlog question and does not affect this verdict.
PROBLEMS:
