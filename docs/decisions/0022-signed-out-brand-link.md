# 0022: The signed-out header's brand link goes to /, not /books

- Date: 2026-11-14
- Status: accepted

## Context
F083's acceptance says a signed-out visitor of `/s/<token>` sees "no header links to my pages". `docs/design/M8.md` said `SiteHeader` was unchanged, but its "Bookshelf" brand link always points at `/books`, a page of the user's own, also when signed out. F083's e2e test checks the shared page has no `a[href^="/books"]`.

## Decision
`SiteHeader`'s brand link is `/books` when signed in and `/` when signed out. `/` already redirects a signed-out visitor to `/sign-in` (proxy), so where the click lands is unchanged; the look is unchanged, so no visual baseline moves.

## Consequences
One line in `components/site-header.tsx`. Rejected: hiding the header on `/s/[token]` (the root layout renders it; a separate layout for one route is more structure for the same result).
