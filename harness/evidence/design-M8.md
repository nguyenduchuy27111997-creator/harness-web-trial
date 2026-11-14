<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-14T15:17:03 on ec91e2b plus working tree
- Architect run: a3460298323eafb7a
- Design sha256: 69c58e99d0770d35d832a331af3db8e6c61291931cbddd381278c8b82c2b62ec

VERDICT: PASS
DESIGN: M8
CHECKED:
- Coverage: F083's acceptance says "no header links to my pages". Before this change the doc said `SiteHeader` was unchanged, but its brand link always went to `/books`, so the doc contradicted the acceptance. The new sentence on line 79 fixes that: the brand link goes to `/books` when signed in and `/` when signed out. The e2e check `a[href^="/books"]` count 0 in `/Users/huynguyen/Desktop/harness-web-trial-loop/F083/e2e/F083-share-shelf.spec.ts:68` now passes by design. The other links in the nav are only rendered when `signedIn`, so the signed-out header has no link to anyone's pages.
- Data model and migrations: none changed.
- Contract: `SiteHeaderProps` stays the same (`signedIn`, `displayName`, `signOut`). The brand link reads from `signedIn`, which the header already receives. The code in `/Users/huynguyen/Desktop/harness-web-trial-loop/F083/components/site-header.tsx` matches the doc: `href={signedIn ? "/books" : "/"}`.
- Behaviour: in `/Users/huynguyen/Desktop/harness-web-trial-loop/F083/proxy.ts`, lines 7-8 redirect `/` to `/sign-in` when signed out and to `/books` when signed in. A signed-out visitor used to reach `/books` and be redirected to `/sign-in` (proxy, line 13). Now that visitor lands on `/sign-in` the same way. The decision's claim that "where the click lands is unchanged" holds. The rendered text and classes do not change, so no visual baseline moves. No other e2e test asserts the brand link's href.
- Module boundaries: unchanged. The change is one line inside `components/`, with no new imports.
- NFR: no change to load or cost. The threat model gets a little stronger, because a signed-out shared page links to nothing private (and those pages are protected by `requireUser`/RLS anyway).
- Consistency: line 85 of `/Users/huynguyen/Desktop/harness-web-trial-loop/F083/docs/design/M1.md` says "app name linking to `/books`". The M8 doc now says it changes this link and cites `/Users/huynguyen/Desktop/harness-web-trial-loop/F083/docs/decisions/0022-signed-out-brand-link.md`, which records the context, the decision and the rejected alternative. The later header specs (M4, M5 and M7 at line 147) only concern the signed-in links, so they do not conflict. Decision 0022 does not name M1.md line 85 as the text it supersedes. I consider that minor, because the M8 text names the change explicitly.
- Simplicity: the change is the smallest that meets the acceptance (one conditional). The decision rejects a separate layout for `/s/[token]` because it would add structure.
PROBLEMS:
