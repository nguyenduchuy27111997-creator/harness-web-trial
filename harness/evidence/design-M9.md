<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-20T15:51:28 on 9ded4b6 plus working tree
- Architect run: a9519dc5716c6caef
- Design sha256: 8566ea5584fc245ae034b2b513fe0dc817da4c11af8a4657c38309257996ebb2

VERDICT: PASS
DESIGN: M9
CHECKED:
- F082 fix (re-review): in /Users/huynguyen/Desktop/harness-web-trial-loop/F090/e2e/F082-cover-display.spec.ts the placeholder-size locator now climbs from the letter to `xpath=ancestor-or-self::*[@data-testid="cover-placeholder"][1]`. On that reverse axis `[1]` is the nearest match, so the locator finds the placeholder `<div>`, the same box that `ancestor-or-self::*[1]` found when the initial was plain text inside the div (F082, d83358c). The `<= 40` / `<= 60` checks are unchanged and measure the placeholder box again. This removes the loosening I reported earlier.
- Agreement: the M9.md `## Specs that move` F082 bullet and /Users/huynguyen/Desktop/harness-web-trial-loop/F090/docs/decisions/0030-f090-specs-that-move.md both describe this locator step change, giving the old and new locators. They agree with the spec diff and with components/book-cover.tsx: with `fill`, the row initial is a `<span aria-hidden class="lg:hidden">` and the grid keeps the `lg:cover-initial` `::before` initial (an `@utility` in app/globals.css, so the variant works).
- status-filter (F013): the "All" check is the same assertion. It runs once, after the first book is added. Nothing is loosened.
- F086-live-list (all 3 tests): only a seed `addBook` step is added. The "Reading (1)" count, the live-title visibility and the `toHaveCount(0)` checks are unchanged and still hold with the seed book.
- F088 "pages follow the system": only one `addBook` step is added before the nav check. The colour checks are unchanged.
- Other F082 checks: the viewport step only. The thumbnail size, signed URL, "Z" visible, "Q" count-0 and no-shift checks are unchanged.
- Specs that read the title first (book-sort, shelf-filter): they read row text with `allInnerTexts().split("\n")[0]` at the default desktop width, where the grid's CSS initial still applies, so the title still comes first. These specs do not move.
- Scope: the amendment changes no data model, migration, contract, module boundary or NFR, and adds no extra layer. The other M9 sections were not re-reviewed.
PROBLEMS:
