# 0021: The add form gets an optional "Total pages" field for the lookup

- Date: 2026-11-14
- Status: accepted

## Context
F079's acceptance says a lookup fills "title, author and total pages, which can still be edited before saving". The add form (M1's `parseNewBook`, `insertBook`, `createBook`) has no total pages field, and `docs/design/M8.md` did not add one, so the filled page count had nowhere to go.

## Decision
The add form gets an optional "Total pages" input (`name="total_pages"`, `inputMode="numeric"`), after Author. `parseNewBook` reads it: blank → left out of the value; otherwise the progress form's rule and message ("Total pages must be a whole number from 1 to 10,000", field `total_pages`). `NewBook` gains `total_pages?: number`; `BookFormState` gains the `total_pages` field. `insertBook` sends the row unchanged without it; with it, it adds `current_page` 0, or `total_pages` for a Finished book, the same rule as the CSV import (M7), so the `books_progress_pair` check holds. No migration: `authenticated` already inserts these columns (the import runs as the user).

## Consequences
M1's add form contract extends with one optional field; a book added without pages is stored exactly as before. Rejected: filling a hidden or display-only page count (the acceptance asks that it be editable and it would be lost on save).
