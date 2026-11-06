# 0009: Re-plan for M5 and the product choices it leaves open

- Date: 2026-11-06
- Status: accepted

## Context
The human added M5 "notes and quotes" to `docs/product/spec.md` (commit 10db501): notes and quotes on a book's page, a `/quotes` page with a search kept in the URL, deleting a book deletes its notes and quotes, and each user sees only their own. M1 to M4 scope did not change. The human asked for the M5 features to be added keeping all passing work, and commits the re-plan themselves after reviewing it.

## Decision
- Backlog: add F040-F051 (M5). No existing feature is removed, re-opened or re-ordered. Owner checks on F040, F044 and F048.
- Book page: a Notes section and a Quotes section, shown whatever the book's status. With none, each says so in one sentence. Both are listed newest first.
- Notes: one text field and an "Add note" button. Text is trimmed and must be 1 to 2,000 characters: "Note is required" or an error saying it must be at most 2,000 characters, next to the field. Each note shows the date it was written, formatted like the book's finish date; editing keeps that date.
- Quotes: a Quote text field, an optional Page field and a "Save quote" button. Text is trimmed and must be 1 to 1,000 characters ("Quote is required", or at most 1,000 characters). The page is a whole number from 1 to the book's total pages (from its reading progress) if it has one, else 1 to 10,000; the error names the range. The bound is checked only when a quote is saved: changing the total pages later leaves existing quotes as they are. A quote with a page shows "Page N".
- Edit and delete: notes and quotes are edited in place with Save and Cancel, like renaming a shelf. Deleting asks first with the shared `ConfirmDeleteButton` (0008).
- `/quotes`: a "Quotes" link in the header. Each quote shows its text, its page if it has one, and its book's title linking to `/books/<id>`. With no quotes, one sentence says so.
- Quote search: `?q=` on `/quotes`, a case-insensitive part match on the quote text or the book title. No match shows one sentence naming the search, with a "Clear search" link, like `/books` (F021). An empty search removes `q`.
- Deleting a book deletes its notes and quotes in the database (cascade). Notes and quotes are protected by RLS on the owner, like books and shelves.

## Consequences
- M5 needs a design doc (`docs/design/M5.md`), written by the loop before F040: new `notes` and `quotes` tables with RLS and a cascade from `books`.
- M1 to M4 designs are unchanged, so no `/design` re-run is needed for them.
