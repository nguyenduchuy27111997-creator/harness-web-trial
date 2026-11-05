# 0007: Re-plan for M4 and the product choices it leaves open

- Date: 2026-11-05
- Status: accepted

## Context
The human added M4 "shelves and progress" to `docs/product/spec.md` (commit ef773de): named shelves, putting books on shelves, a shelf filter on `/books`, and reading progress. M1 to M3 scope did not change. The human reviewed the drafted backlog and choices below and approved them in chat.

## Decision
- Backlog: add F028-F038 (M4). No existing feature is removed, re-opened or re-ordered. Owner checks on F028 and F037.
- Shelves: a "Shelves" link in the header opens `/shelves`, where shelves are created, renamed (in place, with Save and Cancel) and deleted (after a confirm dialog that says the books are kept). Names are trimmed, 1 to 40 characters, and unique per user ignoring case. Errors: "Name is required", "Name must be at most 40 characters", and one saying I already have a shelf with that name. Each user sees only their own shelves (RLS).
- Book page: a Shelves section lists the book's shelves, each with a "Remove from <name>" button, plus a picker of the shelves it is not on and an "Add to shelf" button. With no shelves, one sentence links to `/shelves`.
- Shelf filter: `?shelf=<shelf id>` on `/books`, combining with `?status=`, `?q=` and `?sort=`; "All shelves" removes it. An unknown id, or another user's, shows all books, like an unknown status.
- Progress: total pages (whole number 1 to 10,000) and current page (whole number 0 to total) are saved together from a Progress section on the book page, shown and editable only while the book is Reading; the values are kept when the status changes. The page shows "Page P of T (N%)" and the list shows "N%" with a small bar for Reading books with progress; N is rounded to a whole number. Finishing a book with progress sets the current page to the total, so moving it back to Reading shows 100%.

## Consequences
- M4 needs a design doc (`docs/design/M4.md`), written by the loop before F028: new tables for shelves and book-shelf links, and progress columns on books, all with RLS.
- M1 to M3 designs are unchanged.
