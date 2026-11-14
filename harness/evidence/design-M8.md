<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-14T12:56:32 on dbe3561 plus working tree
- Architect run: a16ef98b6c82f18cc
- Design sha256: 183a259eba2f0352cc01b2c7cc0f5cc8610626ac7fda5f77643d8129dc2db6c4

VERDICT: PASS
DESIGN: M8
CHECKED:
- Round 2 fix: Contract > Covers now says `components/cover-form.tsx` (client) checks the chosen file's size and type against `COVER_MAX_BYTES` and `COVER_TYPES` from `lib/covers.ts`. On failure it shows "Use a JPEG, PNG or WebP image up to 2 MB" and does not submit, so a file over the 3 MB action body limit never reaches Next. The input sets `accept="image/jpeg,image/png,image/webp"`. `parseCoverFile` and the bucket limits still check on the server. The F081 e2e tests one file between 2 and 3 MB and one over 3 MB. The import is allowed: rule 4 only stops `components/` from importing `lib/supabase/` and `@supabase/` directly. `lib/covers.ts` takes the Supabase client as a parameter and imports it only as a type, so the client bundle gets no server code. This closes the F081 acceptance gap ("refused with the message and nothing is stored").
- Coverage: F079 to F087 each still map to their modules, contract entries and migrations. Nothing changed outside the Covers bullet since round 2.
- Data model and migrations: unchanged since round 2. The three migrations only add things and each has a rollback comment. `lib/database.types.ts` is regenerated. The constraints, column grants, storage policies, security definer functions and the Realtime topic policy all fit the features.
- Contract: the lookup route, lib functions, actions and form state still match the data model. `next.config.ts` still says `"2mb"`; the doc assigns the change to `"3mb"` to F081, not to the scaffold, so this is expected.
- Module boundaries: 8 rules, all acyclic. `.dependency-cruiser.cjs` contains `lookup-fixture-only-in-route` and `browser-client-only-in-app`, and they match the doc.
- NFR: load, threat model (tokens, storage, Realtime, lookup proxy) and cost are stated and match the spec and decision 0019.
- Consistency: no conflict with M1 to M7 or decisions 0001 to 0019. The body limit change is recorded in 0020. That decision does not mention the client-side check, but it does not contradict it.
- Simplicity: nothing speculative. The client check adds no new abstraction; it reuses the existing constants.
PROBLEMS:

Relevant files: /Users/huynguyen/Desktop/harness-web-trial-loop/D-M8/docs/design/M8.md, /Users/huynguyen/Desktop/harness-web-trial-loop/D-M8/docs/decisions/0020-cover-body-size-limit.md, /Users/huynguyen/Desktop/harness-web-trial-loop/D-M8/.dependency-cruiser.cjs, /Users/huynguyen/Desktop/harness-web-trial-loop/D-M8/next.config.ts
