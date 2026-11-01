<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-02T04:26:03 on 2606cae plus working tree
- Architect run: a350ebc428174b6d8
- Design sha256: f7424178d78506bf369221eb5a80b534f9200971938b06130bb3c88838af596c

VERDICT: PASS
DESIGN: M1
CHECKED:
- Round 1 fixes: all three are done. (1) The Decisions section ("Testing `lib/`") says the pure parsers and `lib/books.ts` get unit tests, with `listBooks` and `insertBook` tested against a stub `SupabaseClient` passed in as a parameter. `lib/supabase/**` is left out of coverage and covered by e2e instead, and the thresholds do not change. /Users/huynguyen/Desktop/harness-web-trial-loop/D-M1/vitest.config.ts has exactly that exclude, with the thresholds untouched. (2) `parseSignIn` is now separate from `parseSignUp` and only checks that both fields are filled in, so a wrong short password still gets "Invalid email or password". (3) The `books` migration and the `npm run db:types` run belong to F004 outright. F005 to F008 reuse them and add no migration.
- Coverage: each of F001 to F008 maps to the data, contract and routes its acceptance needs:
  - duplicate sign-up: `user_already_exists`, which applies because `enable_confirmations = false` is set under [auth.email] in supabase/config.toml
  - the 6-character password rule
  - the redirect chain `/` -> `/books` -> `/sign-in`
  - the empty state with its "Add book" link
  - the `want_to_read` default
  - field errors with the exact messages
  - `created_at desc` ordering, badges and serif titles
  - isolation through RLS

  Nothing is missing.
- Coverage thresholds in practice: `lib/utils.ts` is only a re-export and adds no functions. `lib/forms.ts` holds only types. `lib/database.types.ts` is only ever imported for its types. It may contain a small generated `Constants` object that no test runs, but those few lines are well inside the 80% line threshold. F001 on its own (lib/auth.ts, fully tested) does not break the function threshold.
- Data model and migrations: supabase/migrations/ does not exist yet, so this is the first migration and it only adds things. The columns, checks, `default auth.uid()`, cascade foreign key, `(user_id, created_at desc)` index and the select/insert policies `to authenticated` fit the features. It has a `-- rollback:` comment. scripts/rls-check.py will pass because RLS is enabled in the same migration. Update and delete policies are left to M2, which is justified.
- Contract: every action, `lib/` function, Supabase client helper and route is listed with its inputs, outputs and error strings, and the types build on the generated types. The env var names match the existing scripts. The doc says `@supabase/ssr` is added pinned in F001 (it is not installed yet). `proxy.ts` is the right file for Next 16.
- Module boundaries: each folder has one job. The four import rules plus no-cycles in the Modules section match the five forbidden rules plus `no-circular` in /Users/huynguyen/Desktop/harness-web-trial-loop/D-M1/.dependency-cruiser.cjs one to one. `includeOnly` now takes in `node_modules/@supabase/` so the `@supabase/*` rules can match package paths. `npx depcruise --config .dependency-cruiser.cjs .` passes on the current tree (10 modules). The doc says openly that root `proxy.ts` falls outside the depcruise scope.
- NFR: the load (tens of users, under 10k rows, one indexed query, no pagination), the threat model (another user, anonymous visitor, forged ownership, CSRF, XSS, no service-role key, sign-in errors that do not reveal whether an email exists) and the cost (free tiers only) are stated and match the spec. The Lighthouse budgets match lighthouserc.cjs. Adding `/sign-in` and `/sign-up` to `pages` will work: perf.sh loads `.env.test`, and the layout's `getUser()` reaches the local stack that check.sh starts.
- Consistency: the routes, the password minimum, the stored status values, the redirect targets and the error copy agree with docs/decisions/0001-stack.md and 0002-product-choices.md. This is the first milestone design, so there is no earlier design to conflict with, and no new decision record is needed.
- Simplicity: nothing speculative. There is no zod, no profile table, no pagination and no update/delete policies. The `lib/forms.ts` generic types are small and both form families use them.
PROBLEMS:
