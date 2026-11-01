<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-02T04:56:14 on 01981b0 plus working tree
- Architect run: aec3071c53e86d9a0
- Design sha256: d97b03b5a9a5b694b2fa2b6b96b5346e6fa27d7e60e517b2de5000b55be0b1b7

VERDICT: PASS
DESIGN: M2
CHECKED:
- Round-1 problems: all five are fixed.
  1. F009 now selects only M1 columns and returns `Book | null`. F010 widens it to `BookDetail | null` after migration 1 and `db:types`, and the doc says F014 and F016 may land before F010 using only M1 fields.
  2. The 404 status: the doc has a "Keeping the 404 status" section. It requires no `loading.tsx` in `app/`, `app/books/` or `app/books/[id]/`, and `notFound()` before any `<Suspense>`. The root layout awaits `getUser()` directly rather than inside a Suspense boundary. F016's e2e asserts `response.status() === 404` for the foreign id and for the nil UUID. This matches `node_modules/next/dist/docs/01-app/02-guides/streaming.md` ("Status codes", "When does streaming start?").
  3. The rating control: it is shadcn `radio-group` with `name="rating"`, five items valued 1 to 5, labels "1 star" to "5 stars" and lucide `Star` icons. The saved rating is the `defaultValue`, and selection shows as `aria-checked`/`data-state`. That passes `scripts/ui-tokens.py`, which rejects raw `<button|input|select|textarea>`.
  4. The empty-tab rule: tabs are always shown and there is one query. The All tab with no rows shows the M1 empty state; a filtered tab with no rows shows "No books here".
  5. `deleteBook`: the signature is now `deleteBook(id: string, _formData: FormData): Promise<void>`. A database error is thrown to the error boundary, and a missing book still redirects to `/books`.
- Coverage: I mapped each acceptance criterion of F009 to F016 in `harness/features.json` to a route, a `lib` function, a component and (where needed) a migration. The build order matches `depends_on`: F010 owns migration 1, and F011, F012 and F015 come after it. F014 owns migration 2 and depends only on F009. F013 and F016 have no schema change.
- Data model and migrations:
  - Both migrations are additive.
  - The backfill runs before `books_finished_on_matches_status`, so existing Finished rows pass the check.
  - The trigger (`before insert or update of status`) sets the date on insert and on a move to Finished, clears it on leaving Finished, and keeps it on a Finished-to-Finished save. It does not fire on rating- or review-only updates. It also covers M1's add form.
  - The update policy has both `using` and `with check`; the delete policy has `using`.
  - The column-level update grant is limited to `status`, `rating`, `review`.
  - Rollbacks are stated, and now restore the update grant to both roles. No downtime and no manual step.
- Contract: every action and `lib` function is listed with inputs, outputs and errors, and they match the columns. Bound actions re-check `isUuid` and `requireUser`. Rating and review writes are filtered on `status = 'finished'`, as decision 0002 requires. `getStats` uses the UTC year on `finished_on`, which matches 0002's stats rule; 4 and 5 plus one unrated gives 3 books and an average of 4.5. `formatAverage` and `formatFinishDate` are specified exactly.
- Module boundaries: the M1 rules are unchanged, and `/Users/huynguyen/Desktop/harness-web-trial-loop/D-M2/.dependency-cruiser.cjs` already enforces them. New components get bound actions and data as props, so there is no import from `components/` to `app/`. No cycles.
- NFR: load matches the spec (tens of users, a few hundred books each). The threat model covers foreign ids on pages and actions, forged ownership or finish date, and oversized input. RLS, column grants, the trigger, table checks and the uniform 404 stop each one. Cost is unchanged.
- Consistency: no conflict with `/Users/huynguyen/Desktop/harness-web-trial-loop/D-M2/docs/design/M1.md`, decision 0001 or decision 0002. It keeps M1's `FormState`/`Parsed` shapes, `requireUser`, the three guard layers and M1's empty state. No earlier decision is replaced.
- Simplicity: nothing speculative. Tabs are server-rendered links, there is no extra index, no new dependency beyond shadcn components, and the delete policy is split out only to keep F014 independent of F010.
- Code: M1 is not built on this branch yet (no migrations, no `lib/books.ts`, `app/layout.tsx` has no `getUser`). So this review checks against M1 as designed. `/Users/huynguyen/Desktop/harness-web-trial-loop/D-M2/next.config.ts` has `cacheComponents: true`, which the doc now handles.
- Wording notes (none blocks the build):
  - The doc calls `export const instant = false` "blocking render". Per `03-api-reference/03-file-conventions/02-route-segment-config/instant.md`, `instant` only controls instant-navigation and static-shell validation; it does not change runtime streaming. The 404 is actually kept by the other rules the doc already states: no Suspense boundary or `loading.tsx` above `notFound()`, and the layout awaits `getUser()` directly.
  - "`instant = false` on the layout if validation asks for it" is conditional. It is concrete enough to act on when the build reports it.
  - Star fill colours must use a token class (for example `fill-primary`), not a palette colour, to pass `ui-tokens.py`.
PROBLEMS:
