# 0019: M8 scope: covers, book lookup, sharing, live list

- Date: 2026-11-14
- Status: accepted

## Context
The human approved M8 in chat on 2026-11-14 as a harder milestone for the harness-kit trial: an outside service, file storage, access for people who are not signed in, paging, and Realtime. Book lookup, covers and shelf share links were out of scope until now.

## Decision
- Backlog: add F079-F087 (M8). No existing feature is removed, re-opened or re-ordered. Owner checks on F079 and F083.
- Book lookup uses Open Library through our own server route, with a 5 s timeout and a one-day cache. Tests, CI and the verifier never call Open Library: the route answers from a fixture when `BOOK_LOOKUP_FIXTURE` is set.
- Covers go in a private Supabase Storage bucket, read through short-lived signed URLs, never public URLs.
- A shared shelf is read by anonymous visitors only through one security definer function or view that returns the shared shelf's allowed columns. RLS on the existing tables is unchanged.
- Realtime carries only the signed-in user's own books (RLS applies).

## Consequences
- M8 needs a design doc (`docs/design/M8.md`) before F079: the cover bucket and its storage policies, the share token table and the anonymous read path, the lookup route's contract and cache, paging, and the Realtime subscription.
- M1 to M7 designs are unchanged.
