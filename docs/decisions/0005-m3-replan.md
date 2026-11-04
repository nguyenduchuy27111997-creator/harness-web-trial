# 0005: Re-plan for M3 and the product choices it leaves open

- Date: 2026-11-04
- Status: accepted

## Context
The human added M3 "keep the shelf tidy" to `docs/product/spec.md` (commit db9a2f8): edit title and author, search, sort, and a yearly reading goal. M1 and M2 scope did not change. The human approved the re-plan in advance and asked for it to run without stopping for confirmation.

## Decision
- Backlog: add F018-F024 (M3). No existing feature is removed, re-opened or re-ordered.
- Edit: an Edit button on `/books/<id>` opens Title and Author fields in place, prefilled, with Save and Cancel; no new route. Same rules and messages as adding a book (required, title at most 200, author at most 120). Ownership is enforced by RLS as for every other book change.
- Search: `?q=` matches any part of the title or author, case-insensitive; leading and trailing spaces are trimmed and an empty search removes `q` from the URL. It combines with `?status=` and `?sort=`. No matches shows "No books match "<q>"." and a "Clear search" link that drops only `q`. A tab with no books and no search still shows "No books here".
- Sort: `?sort=title|rating`; no parameter (or an unknown value) means Newest added. Title A to Z is case-insensitive. Highest rated uses the rating only of Finished books (a kept rating on a non-finished book is hidden, decision 0002, so it counts as unrated); unrated books come last. Ties in every sort fall back to newest added first.
- Reading goal: one goal per user per calendar year (UTC, like the stats in decision 0002), a whole number from 1 to 365, error "Goal must be a whole number from 1 to 365". Progress is "N of G books finished this year" with N from the existing finished-this-year count; the bar is capped at 100% while the text keeps the real numbers. A new year starts with no goal, so Stats invites the user to set one.

## Consequences
- M3 needs a design doc (`docs/design/M3.md`), written by the loop before F018; the goal needs a new table and migration with RLS.
- M1 and M2 designs are unchanged.
