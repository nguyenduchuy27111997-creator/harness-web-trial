<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-05T01:11:19 on b2b226f plus working tree
- Architect run: a95c8aab5de881c7e
- Design sha256: 793093a82c22c0538713d75c166b4d30f270f45d2aa1d55094c4727489dd2a83

VERDICT: PASS
DESIGN: M3
CHECKED:
- Scope of change: `git diff docs/design/M3.md` shows a single edit on line 66 (`/books` route row): "Stays `instant = false`." became "Renders blocking (no `loading.tsx`)." Nothing else in M3 changed.
- Consistency with decisions: docs/decisions/0006-cache-components-off.md removes `cacheComponents`/`partialPrefetching` and the `instant` export, says it rewords the M2 design, and records why (the hidden Activity routes cause duplicate `<main>` elements and field ids). The new wording matches it. The reworded M2 "Keeping the 404 status" paragraph says the same thing: blocking render, no `loading.tsx` in `app/`, `app/books/` or `app/books/[id]/`. 0001 to 0005 are not affected.
- Stale references: grep over docs/design, docs/decisions, docs/product/spec.md, harness/PRESET.md, app/, components/ and next.config.ts finds no remaining `instant` or `cacheComponents` dependency outside 0006 and the M2 sentence that says the export no longer exists. M3 never relied on route state being kept across navigation, so "drafts are not preserved" (0006 Consequences) conflicts with no M3 behaviour. M3 line 67's Cancel/saved behaviour is within one page.
- Code: next.config.ts no longer sets `cacheComponents`/`partialPrefetching`. app/books/page.tsx has its `instant` export removed. The only `loading.tsx` is app/stats/loading.tsx; there is none under app/books, which is what line 66 claims. M2 does not restrict `/stats`, and that route has no 404 path.
- Spec: the change is about rendering mode only. Spec scope and feature behaviour for search, sort and filters are unchanged.
- Data model, contract, modules, NFR, simplicity: unchanged by this edit, and none of them depends on cacheComponents.
PROBLEMS:
