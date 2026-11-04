<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-05T01:08:39 on b2b226f plus working tree
- Architect run: a940c7e1ac6a8651c
- Design sha256: d39747f242b5e38301c45710aaf9e19fb0a0cf2bbd3bd5d8c64846138a2b8b81

VERDICT: PASS
DESIGN: M2
CHECKED:
- Coverage: the only change is the "Keeping the 404 status" paragraph under Routes. The F016 404 behaviour is still fully specified: `app/books/[id]/page.tsx` renders blocking, awaits `params`, `requireUser()` and `getBook`, and calls `notFound()` before any `<Suspense>`. There is no `loading.tsx` in `app/`, `app/books/` or `app/books/[id]/`, and the root layout awaits `getUser()` outside any Suspense boundary. No other feature section changed.
- Code match: `next.config.ts` no longer sets `cacheComponents` or `partialPrefetching`. `export const instant = false` is gone from `app/layout.tsx`, `app/books/page.tsx`, `app/books/new/page.tsx` and `app/books/[id]/page.tsx`. `app/books/[id]/page.tsx` does what the paragraph says. The only `loading.tsx` files in `app/` are in `app/stats/` and `app/books/[id]/not-found.tsx` sits next to the book page; neither is on the `/books/[id]` path the paragraph protects. `app/layout.tsx`'s `Header` awaits `getUser()` with no Suspense around it.
- 404 behaviour: with `cacheComponents` off, these pages read the session cookie, so they are dynamic and render blocking with no fallback flushed first. `notFound()` therefore still sets HTTP 404. `e2e/book-not-found.spec.ts` (F016) still asserts `status()` is 404 for the foreign id and for the nil UUID (lines 25 and 31). I did not run the e2e.
- Data model and migrations, contract, module boundaries: not touched by this diff and still consistent.
- NFR: no change. Turning cacheComponents off removes client-side route keeping and does not change load or cost meaningfully.
- Consistency: matches decision `docs/decisions/0006-cache-components-off.md`, which records what it replaces (M2 had turned cacheComponents on only for the 404 status behaviour) and why (the F025 duplicate `<main>` elements and duplicate ids). No conflict with 0001–0005, M1.md, `harness/PRESET.md` or `docs/product/spec.md`, none of which mention cacheComponents or instant.
- Simplicity: the change removes a config flag and a cacheComponents-only export. Nothing new added.
- Follow-up outside M2 (does not block this verdict): `/Users/huynguyen/Desktop/harness-web-trial-loop/F025/docs/design/M3.md` line 66 still says "Stays `instant = false`." for `/books`. That export no longer exists after 0006, so M3.md is now stale against the code and the decision, and 0006's Consequences do not mention it. Rewording it to e.g. "Renders blocking; no `loading.tsx`" needs its own M3 architect pass. Also, the comment in `/Users/huynguyen/Desktop/harness-web-trial-loop/F025/app/page.tsx` line 5 still mentions "instant validation"; that is cosmetic.
PROBLEMS:
