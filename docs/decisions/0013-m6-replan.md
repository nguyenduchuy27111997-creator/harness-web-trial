# 0013: Re-plan for M6 and the product choices it leaves open

- Date: 2026-11-07
- Status: accepted

## Context
The human chose M6 "reading history" and added it to `docs/product/spec.md`: start dates, editing the start and finish dates, reading a book again with its past reads kept, monthly and page counts on `/stats`, and a year in review at `/stats/<year>`. M1 to M5 scope did not change.

## Decision
- Backlog: add F052-F063 (M6). No existing feature is removed, re-opened or re-ordered. Owner checks on F053, F056 and F061.
- Start date: moving a book to Reading sets its start date to today; moving it back to Want to read clears it; moving Reading to Finished keeps it. Books that were Reading or Finished before M6 have no start date until it is edited.
- Book page: "Started <date>" and "Finished <date>", formatted like the finish date today. A finished book with both dates shows "Read in N days", counting both days (started and finished the same day is "Read in 1 day").
- Edit dates: an "Edit dates" button opens date fields (Started; Finished only for a finished book) with Save and Cancel, like editing title and author. Neither date can be in the future, and Finished cannot be before Started. Started may be cleared; Finished may not while the book is Finished.
- Read again: only on a finished book. The current read (start date, finish date, rating) is stored as a past read; the book becomes Reading with today's start date and no finish date or rating, and its current page goes back to 0. The review stays on the book. Past reads are listed newest first in a "Past reads" section, hidden when there are none, and deleted with the shared `ConfirmDeleteButton` (0008).
- Counting: "finished this year" on `/stats`, the goal progress, the monthly chart, pages read and the year in review count every read finished in that year: the book's current finished read plus its past reads. A read's pages are the book's total pages; a book with none adds no pages. The average rating on `/stats` stays the average of the books' current ratings.
- Monthly chart: 12 bars for January to December of this year with their counts, also readable as text (for example a list or table a screen reader reads).
- Year in review: `/stats/<year>` for a 4-digit year up to this year; anything else is the not found page. It lists that year's reads newest finished first (title linking to the book, finish date, rating), the average rating of the rated ones (one decimal), a "Highest rated" list of the reads with that year's top rating, and "Previous year" / "Next year" links (no next link for this year). `/stats` links to this year's review.
- Reads are protected by RLS on the owner, like books, notes and quotes, and are deleted with their book (cascade).

## Consequences
- M6 needs a design doc (`docs/design/M6.md`), written by the loop before F052: a start date column on `books`, a `reads` table with RLS and a cascade from `books`, and the counting rules above in one place.
- M1 to M5 designs are unchanged, so no `/design` re-run is needed for them.
