<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-10T11:14:19 on d271f08 plus working tree
- Architect run: a8df088bf4f8a11d3
- Design sha256: 8ec82881c98becaaa83fb793c43361534dfd18003d597ca26fee919110644d92

VERDICT: PASS
DESIGN: M7
CHECKED:
- Coverage: each of F064 to F075 maps to its modules, actions, routes and migration. Tags (F064 to F067) use `lib/tags.ts`, the `book_tags`/`tags` tables and `/tags`. Export and import (F068 to F070) use `lib/csv.ts`, `lib/library.ts`, `lib/import.ts`, `import_books` and `/library`. The queue (F071, F072) uses `lib/queue.ts`, `up_next`, `move_up_next` and the `updateBookStatus` unqueue. Profile and account delete (F073, F074) use `profiles`, `delete_account` and `/settings`. Isolation (F075) is an e2e spec that goes through supabase-js with B's session.
- Previous round's four problems: all fixed. The tag action contract now gives signatures, the error-to-field mapping, `isUuid` handling and revalidation. `import-form` checks the size on the client, and the server check remains the authority. `parseImport` takes `today` and drops `started_on` when it is after `finished_on ?? today`. `listExportRows` and `listAllBookKeys` read in `.range()` pages of 1,000.
- Data model and migrations: the three scaffold migrations (`/Users/huynguyen/Desktop/harness-web-trial-loop/D-M7/supabase/migrations/20261110100000_tags.sql`, `20261110110000_up_next.sql`, `20261110120000_profiles.sql`) only add things and each has a `-- rollback:` line. They match the doc: RLS enabled, `revoke all` followed by the column grants the doc lists, `unique (id, user_id)` and the lower(name) unique index on `tags`, composite foreign keys that cascade, `security invoker` functions with `revoke execute` from public and anon. `delete_account` is in its own F074 migration, gated by decision 0017 (proposed), so F074 waits as `needs_human` and nothing is applied without a human's approval.
- Contract: every action, route handler and `lib` function lists its inputs, outputs and error messages, and they match the tables and grants. Import re-parses the CSV on the server and does not trust rows sent by the client.
- Module boundaries: the M1 to M6 rules in `.dependency-cruiser.cjs` are unchanged. The new `lib` files import only `lib/csv.ts` and `lib/books.ts`, so there are no cycles. Components take data and actions as props.
- NFR: the doc states load (tens of users, 1 MB / 1,000 rows per import, paged reads), a threat model (RLS, composite foreign keys, invoker functions, a definer function scoped to `auth.uid()`, formula injection accepted as a known limit) and unchanged cost. These match the spec's scale.
- Consistency: the doc builds on M1 to M6 and decision 0016. The only `security definer` function is recorded in decision 0017. Triggers that would need a `delete from` were rejected because the migration lint treats them as destructive, and the doc says so.
- Simplicity: no speculative layers. The positions without a unique constraint and the tag cleanup in app code are justified in the doc.
- Not checked (low budget): whether the M2/M6 column grants on `books` let an invoker function update `started_on`/`finished_on`. I assumed they do because F055 already edits dates. F069's import tests will show it if not.
PROBLEMS:
