<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-17T16:17:33 on cdcb285 plus working tree
- Architect run: a96c0a49a3a849e79
- Design sha256: d3c9c5b30554d012da4306e6201d1ce4bf814b1e27ba57d5a11787a92c01be62

VERDICT: PASS
DESIGN: M9
CHECKED:
- Scope: I reviewed only the staged section "## Specs that move" in /Users/huynguyen/Desktop/harness-web-trial-loop/F093/docs/design/M9.md (`git diff --cached`). The rest of the doc already has a PASS.
- Fixes from the last FAIL: both are in.
  - The "Baselines only" line now also names shelves-create-end-{light,dark}, F067-tags-empty, F048-quotes, F072-up-next-empty, F089-sidebar-{light,dark} and F089-tab-bar-{light,dark}, each with its spec file.
  - The F072 entry now says its steps and checks do not change and only its baseline F072-up-next-empty is redrawn.
- Baselines are complete: I listed every `toHaveScreenshot` and `expectScreens` in e2e/ again and matched each to the page it shoots.
  - Every baseline of /shelves, /tags, /quotes and /up-next outside F093's own lists-layout spec is now listed: F028, F029, F030, F033, shelves-create-end, shelves-validation-end, F067-tags-taken, F067-tags-empty, F048, F071, F072, and F089 sidebar and tab bar.
  - The other candidates shoot different pages, so they need no change:
    - F083-shared-shelf and F084-shared-nothing-private: the anonymous /s/<token> page.
    - F087-stopped-sharing: the "Shelf not found" 404.
    - F075-b-empty-shelf and F075-m7-isolation-end: /books.
    - F065-tags-full and F047-quote-deleted: the book page.
    - F034-shelf-filter: /books.
- Controls that move: the set of specs and helpers that reach Rename, Delete, Share, Stop sharing, Copy link, Move up, Move down, Remove and Start reading is unchanged since last round, and all are listed: shelves-rename, shelves-delete, F067, F083, F084, F087, `shareShelfLink` in e2e/shelves.ts, F071 and F072. The new helper e2e/rows.ts is described with its signature.
- Touches: F093's `touches` in harness/features.json cover only app/shelves, app/tags, app/quotes and e2e/*lists-layout*. The caller reports that the human confirmed (kit 5.47.1) that the specs and helpers this section lists count as F093's touches, and the section says so.
- Consistency and simplicity: the section only lists the test changes the menu redesign forces, and says every check stays. It adds no new layers and no conflict with earlier designs or decisions.
PROBLEMS:
