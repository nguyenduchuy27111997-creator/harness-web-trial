# 0002: Product choices the spec leaves open

- Date: 2026-11-02
- Status: accepted

## Context
The spec (`docs/product/spec.md`) leaves some behavior open. The human approved the backlog in advance and asked for the smallest reasonable choices, recorded here.

## Decision
- Routes: `/sign-up`, `/sign-in`, `/books`, `/books/new`, `/books/<id>`, `/stats`. `/` redirects to `/books`, which redirects signed-out visitors to `/sign-in`. After sign-up or sign-in the user lands on `/books`; after sign-out on `/sign-in`.
- Passwords: at least 6 characters (Supabase's default). Sign-up signs the user in at once (no email confirmation, per spec). Wrong credentials show "Invalid email or password".
- Statuses are stored as `want_to_read`, `reading`, `finished`; the URL filter uses `?status=want_to_read|reading|finished`, and no parameter means All. An unknown value shows All.
- Finish date: set to today's date (UTC, server side) when a book moves to Finished; cleared when it moves away from Finished. Rating and review are kept when it moves away, but only shown and editable while the book is Finished.
- Rating and review are saved independently; a review may be empty.
- Stats: "finished this year" counts books whose finish date is in the current calendar year (UTC). "Average rating" is the mean of the ratings of those same books, rounded to one decimal; "No ratings yet" when none are rated.
- Book ids are UUIDs. An id that is not a valid UUID, does not exist, or belongs to another user shows the same "Book not found" page with HTTP 404; access is enforced by Row Level Security, not only by the query.
- Look and feel: Lora (Google font via `next/font`) is the serif for headings and book titles; body text uses the system sans stack. Tokens in `app/globals.css`, documented in `docs/design-system.md`. The dark theme tokens were removed (light only, per spec).
- No password reset, profile page or account deletion (out of scope).

## Consequences
- Finish dates near midnight follow UTC, not the user's time zone; revisit if the human cares.
- Moving a book back to Finished re-shows its old rating and review, with a new finish date.
