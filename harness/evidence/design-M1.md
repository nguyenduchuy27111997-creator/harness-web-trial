<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-04T10:33:47 on 62f644a plus working tree
- Architect run: a5357d5962e2ed4ec
- Design sha256: 37e7e3596cc03598a8cd2caeb6aa7b30058a7c59a72db731fa5628da67416ec1

VERDICT: PASS
DESIGN: M1
CHECKED:
- Coverage: F017 (bug, milestone M1; 4 acceptance criteria) is now in the Features list. It maps to the `proxy.ts` redirect, with no data model or contract change. All four criteria are covered: sign-up lands on /books, signed-in /sign-in goes to /books, signed-in /sign-up goes to /books, and signed-out both forms still render. `/Users/huynguyen/Desktop/harness-web-trial-loop/F017/e2e/signed-in-auth-pages.spec.ts` tests each one.
- Data model and migrations: no schema change, no new migration, RLS untouched. This is correct for a routing-only fix.
- Contract: the Routes table now gives `/sign-up` and `/sign-in` access "signed out", with the proxy redirect named. The `proxy.ts` paragraph describes both redirects. This matches `/Users/huynguyen/Desktop/harness-web-trial-loop/F017/proxy.ts`: an exact path match on `/sign-in` or `/sign-up` with a user present redirects to `/books`. No server actions or public functions change. Sign-in and sign-up actions still redirect to /books themselves, and the proxy runs before the session cookie exists on that POST, so the actions are not affected.
- Module boundaries: the `proxy.ts` row now says "signed-in/signed-out redirects". It still imports only `lib/supabase/proxy.ts` and stays outside the dependency-cruiser scope. The import rules are unchanged and acyclic.
- NFR / threat model: no change. Decision 0004 rightly treats this as UX, not security. `requireUser()` and RLS stay the real guards, and the doc still says the proxy is a convenience.
- Consistency: decision 0004 records why "any" was replaced and says what it replaces. The Decisions section states the replacement and points to 0004, and the old closing sentence ("no new file in docs/decisions/") has been corrected. This fits 0002 ("after sign-in the user lands on /books"). It does not conflict with M2's design, which adds `/stats` to the signed-out redirect; the M1 doc's proxy text stays M1-scoped, as before.
- Simplicity: one extra condition in the existing proxy. No page-level check, no new module or abstraction, no configurability.
PROBLEMS:
