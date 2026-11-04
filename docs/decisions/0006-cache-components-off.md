# 0006: `cacheComponents` is off

- Date: 2026-11-05
- Status: accepted

## Context
Bug F025: with `cacheComponents: true` Next keeps visited routes mounted but hidden (React Activity, up to 3). The document then had up to five `<main>` elements, duplicate field ids and doubled accessible names ("Status Status", "Title Title"). Activity has no switch to unmount hidden routes, and the hidden tree cannot be emptied from inside (updates to a hidden Activity are deferred). The app uses none of the cache features (`use cache`, `cacheLife`, `cacheTag`); design M2 turned it on only for the status-code behaviour of `notFound()`, which a normal blocking render gives without it.

## Decision
- Remove `cacheComponents` and `partialPrefetching` from `next.config.ts`. Routes unmount on navigation again.
- Remove the `export const instant = false` lines (a cacheComponents-only export) from the root layout and the books pages. Pages are dynamic (they read the session cookie), so `notFound()` still answers 404 before anything streams.
- Fixed field ids (`email`, `password`, `status`, `title`, `author`) stay: with routes unmounted on navigation each is unique in the document, so no `useId` is needed.

## Consequences
- Design M2's "Keeping the 404 status" paragraph is reworded; `e2e/book-not-found.spec.ts` still asserts the 404.
- Form drafts and open panels are no longer preserved across navigation.
- Covered by `e2e/page-navigation-dom.spec.ts`.
