<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-22T01:19:08 on 70f97837 plus working tree
- Architect run: ad721c7e4c7fbdcf0
- Design sha256: 563f90be183d93643263cde904407087686588246bfd9483ded5c782b710498f

VERDICT: PASS
DESIGN: M9
CHECKED:
- Coverage: F095's three acceptance criteria (list slide in and out, press and settle on status and rating, reduced motion) still map to `BookList`, `BookStatusForm` (status segments) and `RatingForm`, with the springs in `components/motion.ts`. The amendment changes only where `MotionConfig` lives. F088 to F094 and F096 are unaffected.
- Data model and migrations: no change. The amendment touches no schema.
- Contract: no change. `BookList` props stay as the design states, and `app/books/page.tsx` still needs no edit for F095.
- Module boundaries: `components/providers.tsx` is gone from both the doc's `components/` list and the tree. `grep` finds `motion/react` imported only in `components/book-list.tsx`, `components/book-status-form.tsx` and `components/rating-form.tsx`, all client components in `components/`, which matches the doc's convention. No remaining reference to `providers` in `app/`, `components/`, `lib/`, `e2e/` or `.dependency-cruiser.cjs`. F095's `touches` in `harness/features.json` (`components/*providers*`, `app/layout.tsx`, `components/book-list*`, `components/book-status-form*`) cover deleting the provider and removing the layout wrap. `rating-form.tsx` is not in those `touches`, but the design already said F095 changes it, so this amendment does not introduce that.
- Reduced motion: unchanged. Each of the three components wraps its whole returned tree in `<MotionConfig reducedMotion="user">`: the `<ul>` with `AnimatePresence` in `BookList`, and the `<form>` in `BookStatusForm` and `RatingForm`. No `motion.*` element is rendered outside a config, and none of them uses a portal. The forms' own `useReducedMotion` checks stay. CSS animations still follow `ui-base.css`. The doc's reduced-motion line now says "(in each animating component)", which matches the code.
- UI: the `## UI` motion section is unchanged apart from the reduced-motion line. Screens, states and layouts are not affected.
- Specs that move: none. No e2e spec references providers or the layout wrap.
- NFR: Lighthouse budgets in `/Users/huynguyen/Desktop/harness-web-trial-loop/F095/lighthouserc.cjs` stay as the design states (LCP 2500 ms on `/`, `/styleguide`, `/sign-up`, `/sign-in`). Only `app/books/page.tsx` and `app/books/[id]/page.tsx` render the three animating components, so none of the budgeted pages loads Motion. That matches the design's statement that Motion adds weight only "to client pages using it". No threat-model or cost change.
- Consistency: the F095 line in M9 cites decision `/Users/huynguyen/Desktop/harness-web-trial-loop/F095/docs/decisions/0033-f095-motion-config-per-component.md`. That decision records what it replaces (the root-layout provider) and why (the measured LCP failure on `/styleguide`). No conflict with decision 0024 or with M1 to M8.
- Simplicity: the change removes a layer (the provider) and adds no abstraction. Repeating `MotionConfig` in three components is cheaper than a shared wrapper.
PROBLEMS:
(none blocking)

Non-blocking notes:
- `/Users/huynguyen/Desktop/harness-web-trial-loop/F095/components/motion.ts`, lines 3-4: the comment still says Motion follows reduced motion "through <MotionConfig reducedMotion="user"> in a client provider around the app". That is now stale. Change it to say each animating component wraps itself, per decision 0033.
- Decision 0033 gives Motion's chunk as "about 9 KB gzipped", but the NFR in M9 (line 142) says "about 30 KB gzip". The two estimates differ. It does not affect the budget argument, but one of them should be brought in line with the other.
