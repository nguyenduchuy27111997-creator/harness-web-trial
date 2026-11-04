<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-04T13:14:52 on 543427e plus working tree
- Architect run: a2f4b5da6dc3d4688
- Design sha256: 90a032731ddbc3cbd7113050db608a7b5113dc4f80905ed87fca8f9148bd67dc

VERDICT: PASS
DESIGN: M3
CHECKED:
- Coverage: I mapped F018 to F024 (from harness/features.json) against the design, and every acceptance step has the data, contract and UI it needs.
  - F018/F019: the title/author update grant, `parseBookFields`, `updateBookFields` and `editBook` returning `fieldErrors` and `values`. The fields have no `maxLength`/`required`, so the 200/120-character server messages can show.
  - F020/F021: `parseSearch`, `filterBooks` and `booksHref`. StatusTabs keeps `q` and `sort`. The "No books match" state links "Clear search" to `booksHref({ status, sort })`, which gives `/books?status=reading` as F021 expects.
  - F022: `listBooks` also selects `rating`. `sortBooks` keeps ties newest first and counts only Finished ratings. It produces the exact orders in the acceptance: Delta, Charlie, Alpha, Bravo / Alpha, Bravo, Charlie, Delta / Alpha, Bravo, Delta, Charlie / Alpha, Bravo, Charlie on the Finished tab.
  - F023/F024: the `reading_goals` table, `parseGoal` (rejects 0, 366 and 2.5; the field uses `inputMode="numeric"` without min/max/step so the browser does not block the server error), the upsert, and `goalProgress` (1/20 is 5, 1/10 is 10). The Progress bar has an accessible name.
- Data model and migrations: I checked the existing migrations in supabase/migrations/.
  - The M2 migration revoked update on `books` and granted only status, rating and review. Migration 1 adds an update grant on title and author. It is additive, has a rollback, and needs no type change.
  - The finish-date trigger fires only on `update of status`, so editing a title or author does not touch it.
  - The `books_update_own` policy and the 1–200 / 1–120 length checks still guard edits.
  - `reading_goals` has primary key `(user_id, year)`, `user_id` defaults to `auth.uid()` and cascades on delete, and goal is checked to 1–365. RLS covers select, insert and update. It revokes all and grants only select, insert (year, goal) and update (year, goal).
  - The PostgREST upsert (`on_conflict=user_id,year`, payload `{year, goal}`) works with these grants: the default fills `user_id` with no insert privilege on it, the conflict columns are readable, and the DO UPDATE columns are granted.
  - No downtime and no manual step.
- Contract:
  - Every new lib function and both server actions list their inputs, outputs and errors, following the M1/M2 pattern I checked in app/books/[id]/actions.ts: `requireUser`, then parse, then `isUuid`, then "Book not found" or "Could not save. Try again.", then revalidate.
  - The `listBooks` signature is unchanged. lib/books.test.ts does not check the select string, so no test needs editing.
  - Every `ShelfBook` is still a `Book`, so `BookList` still type-checks.
  - The routes table covers `/books`, `/books/[id]` and `/stats`. `/books` stays `instant = false`. `/stats` already has loading.tsx and has no 404, so that is fine.
- Module boundaries:
  - The new components get data and actions as props and import only `lib/books.ts` (allowed; existing components already do) and `next/navigation`. The new `lib/goals.ts` imports no app/ or components/ code.
  - .dependency-cruiser.cjs needs no change and matches the doc's four rules. No new cycle.
- NFR:
  - Load matches the spec: in-memory search and sort over at most a few hundred rows, plus one primary-key lookup.
  - The threat model covers editing another user's book or goal, forging `user_id`, oversized input, and `q` reaching a query. `q` never reaches PostgREST, and the year is set on the server.
  - Cost is unchanged. No new public page, so Lighthouse config is unchanged.
- Consistency:
  - The M2 note "Title and author are not editable in M2" applies only to M2. Decision 0005 records edit, search, sort and goal. M3's decision section says why the grant is widened.
  - The tab hrefs from `booksHref` are the same as the current `/books?status=...`, so the M2 status-filter e2e tests stay valid. UTC year matches decision 0002. Error texts match decision 0005 and the acceptance.
- Simplicity:
  - No speculative layers. `booksHref` is the one URL builder, used by four controls. `parseNewBook` reuses `parseBookFields` to avoid duplicating its checks.
  - `reading_goals.created_at` is not needed by any feature but is a harmless audit column, the same as on books. Not blocking.
- Non-blocking notes for implementers:
  1. Run the search text through `parseSearch` (or trim it) before `booksHref`, so a whitespace-only search drops `q`.
  2. The doc says `saved` closes `EditBookForm` but does not say the same for the "Change goal" form. Closing it the same way keeps the "1 of 10 books finished this year" text visible as F024 expects.
PROBLEMS:

Files reviewed:
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/docs/design/M3.md
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/docs/decisions/0005-m3-replan.md
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/supabase/migrations/
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/lib/books.ts
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/lib/books.test.ts
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/lib/stats.ts
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/app/books/page.tsx
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/app/books/[id]/actions.ts
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/app/stats/page.tsx
- /Users/huynguyen/Desktop/harness-web-trial-loop/D-M3/.dependency-cruiser.cjs
