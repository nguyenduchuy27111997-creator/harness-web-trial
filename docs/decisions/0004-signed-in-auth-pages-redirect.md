# 0004: Signed-in users are redirected away from /sign-in and /sign-up

- Date: 2026-11-04
- Status: accepted

## Context
Bug F017: a signed-in user who opens `/sign-in` or `/sign-up` sees the form, with "Sign out" already in the header. Design M1 listed both routes with access "any", and `proxy.ts` only redirected signed-out visitors. Decision 0002 says a signed-in user lands on `/books`.

## Decision
- `/sign-in` and `/sign-up` are for signed-out visitors only. `proxy.ts` redirects a signed-in user who requests either path to `/books`.
- No server-side check is added in the pages: showing the form to a signed-in user is a UX problem, not a security one, so the proxy redirect alone is enough.

## Consequences
- Design M1's Routes table and `proxy.ts` section change accordingly.
- Covered by `e2e/signed-in-auth-pages.spec.ts`.
