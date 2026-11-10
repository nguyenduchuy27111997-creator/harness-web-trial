---
name: malformed-id-edge-case
description: Always probe /books/not-a-uuid when a feature adds a query to the book page; new queries without the isUuid guard turn the 404 into a 500
metadata:
  type: project
---

Decision 0002 requires that a non-UUID, missing, or foreign book id shows "Book not found" with HTTP 404. The existing e2e (book-not-found.spec.ts) only checks a foreign id and an all-zero UUID, so it does not catch a malformed id.

**Why:** F071 (2026-11-10) added a query to the book page's Promise.all with no UUID guard, and /books/not-a-uuid returned a 500 ("invalid input syntax for type uuid"). An isUuid guard in lib/queue.ts fixed it, and the re-verify the same day saw a 404. F064 (tags, same day) hit the same bug in lib/tags.ts and was fixed the same way, so the pattern repeats with each new book-page query.
**How to apply:** When a feature touches app/books/[id]/**, open /books/not-a-uuid while signed in and expect a 404. The hydration-mismatch console error about `caret-color: transparent` on the search input comes from Playwright screenshots hiding the caret, not from the app. Note that browser_console_messages with all=true replays errors from earlier runs, so check that the errors come from the current navigation.
