# 0014: Monthly counts come from `getFinishedByMonth`, not from `Stats`

- Date: 2026-11-09
- Status: accepted

## Context
`docs/design/M6.md` grows `Stats` with `byMonth: number[]` (F059) and `pagesRead` (F060). `getStats` is tested with `toEqual({ finishedThisYear, averageRating })` (F058). Adding a field to `Stats` would force those two existing assertions to change, and a first attempt at F059 edited them (and regenerated five other baselines) without a decision.

## Decision
`Stats` and `getStats` stay as F058 left them. F059 adds `getFinishedByMonth(supabase, now = new Date()): Promise<number[]>` (`countByMonth(await listFinishedReads(supabase, now.getUTCFullYear()))`); `/stats` runs it in its `Promise.all`. Existing assertions are untouched; new tests cover the new functions. `docs/design/M6.md` is changed in its F059 line and in the `lib/stats.ts` list, and the architect re-approves it. F060 is not decided here.

## Consequences
- `/stats` runs two more indexed range queries (a few hundred rows at most; the design's NFR already assumes this size).
- The `MonthlyChart` rules in the design are unchanged.
- F059 changes how `/stats` looks, so the `/stats` baselines of F015, F023, F024, F027 and F058 change only by the added "Finished by month" section; the designer reviews each.

## Update 2026-11-09
The designer found that books finished "today" draw the only bar under the current month, so the F015, F023, F024 and F058 baselines would change on the first day of the next month. Those four `toHaveScreenshot` calls now mask the chart's list (only a `mask` option is added; no assertion is removed). F027 (all zeros) and F059 (fixed March dates) do not depend on the date. The chart uses `text-sm` (design-system scale), two rows of six months below `sm:`, and a bottom border under the bars so an all-zero chart still reads as a chart.
