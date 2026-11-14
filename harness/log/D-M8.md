# D-M8 log

## 2026-11-14 - CI fix: duplicate realtime.messages policy in db-types --check

- Second CI run on PR #200 (b14d005): the `check` job exited 3 in `scripts/db-types.sh --check` with `policy "books_topic_owner_receives" for table "messages" already exists`. Same cause as the entry below: `realtime.messages` is outside `public`, so the dumped policy is already in the scratch database when `20261114120000_books_realtime.sql` runs. The `cover_is_shared` / `public.books` errors in that log are non-fatal noise from restoring the non-public dump.
- Fix: `drop policy if exists books_topic_owner_receives on realtime.messages;` before its `create policy`. Design doc untouched.
- `./scripts/check.sh` passes locally.
- **For the owner:** the `scripts/db-types.sh` note below also applies to `realtime.messages` policies.

## 2026-11-14 - CI fix: duplicate storage.objects policies in db-types --check

- CI on PR #200 did not fail because of the registry rate limit. Those pulls retried and finished, and all e2e shards pass. The `check` job exited 3 in `scripts/db-types.sh --check`. That script builds its scratch database from `pg_dump --exclude-schema=public` of the shared stack, and the stack already had this branch's `covers_owner_select/_update/_delete` policies on `storage.objects`. So `20261114100000_covers.sql` stopped with "policy already exists".
- Fix: `drop policy if exists <name> on storage.objects;` before each of the 4 `create policy covers_owner_*` in `20261114100000_covers.sql`, and before `create policy covers_anon_sign_shared` in `20261114110000_shelf_shares.sql`. Nothing else changed, and the design doc is untouched. `npm run db:types` did not change `lib/database.types.ts`.
- `scripts/db-types.sh --check` and `./scripts/check.sh` both pass locally.
- **For the owner:** `scripts/db-types.sh` is protected, so it was not edited here. It should also drop the dumped `storage.objects` policies in the scratch database before it applies migrations. Then other branches that add storage policies will not hit the same duplicate error.
