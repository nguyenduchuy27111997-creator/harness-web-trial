# 0018: CSV import drops a finish date in the future

- Date: 2026-11-10
- Status: accepted

## Context
docs/design/M7.md (`parseImport`) keeps a valid `finished_on` on a finished row, and drops `started_on` when it is after `finished_on ?? today`. It does not say what happens to a `finished_on` after today. The M6 date form (`parseReadingDates` in `lib/books.ts`) refuses any date in the future ("The date cannot be in the future").

## Decision
`parseImport` treats a `finished_on` after `today` like an invalid date: it imports as empty, and the insert trigger then sets today's date (the book is finished). This is one more lenient field, not a skip reason; the row still imports. `started_on` is then checked against the kept `finished_on ?? today` as the design says.

## Consequences
- An imported book can never hold a date the book page's own date form would refuse.
- No change to the design's contract or skip reasons; F070's report is unaffected.
