<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-18T19:09:34 on ce96fd4 plus working tree
- Architect run: aeadb23c3d849b4e9
- Design sha256: 56589dd2e197d3b0265ccc71f547640b1a28f9c1500de9057696d16b0e528d02

VERDICT: PASS
DESIGN: M9
CHECKED:
- Coverage: F090's acceptance is still fully covered by the /books entry: a cover grid on a computer and rows on a phone, the status filter as a segmented control with counts, search labelled "Search books", sort as a menu, placeholder shapes while loading, and an empty shelf with an Add book button. The change only touches the filter layout, the wrapping filter row and the placeholder cover.
- Code match: the /books text matches the built code.
  - /Users/huynguyen/Desktop/harness-web-trial-loop/F090/components/status-tabs.tsx: 2x2 grid of `h-11` segments with no sideways scroll, and from `sm` a `sm:inline-flex sm:h-9` track with `sm:h-7` segments.
  - /Users/huynguyen/Desktop/harness-web-trial-loop/F090/app/books/page.tsx: the filter row is `flex flex-wrap items-center gap-4`.
  - /Users/huynguyen/Desktop/harness-web-trial-loop/F090/components/book-cover.tsx: the placeholder is `aria-hidden`, with the title `line-clamp-5` and the author `line-clamp-2` from `lg`.
- Consistency inside M9: fixed. Line 67 now gives `BookStatusForm` 44 px under `lg` and 32 px from `lg`. It gives the /books `StatusTabs` 44 px under 640 px and 28 px segments in a 36 px track from 640 px. It says decision 0028 overrides the sizes for `StatusTabs` only. Decision 0028 point 2 says the same, so F091 and /styleguide each have one size to build.
- Touch-target accuracy: fixed. The "same height" wording is gone from both files. Both now say what actually happens with a coarse pointer: /Users/huynguyen/Desktop/harness-web-trial-loop/F090/app/ui-base.css raises Sort and search to 44 px (its `(pointer: coarse)` rule), while the plain status links stay 28 px in the 36 px track. Both record this as an accepted exception to the ui-guide's 44 px touch-target rule, note that e2e/a11y.ts checks only 390 px, and say to revisit it in a tablet pass.
- Earlier decisions and spec: no conflict with 0024 (the M9 redesign), 0027 (list loading) or the spec. Using 640 px instead of the ladder's 768 px is stated explicitly.
- Data model, migrations, contract and modules: unchanged.
- Simplicity: the sideways scroll, snap and scroll-into-view are removed, and nothing speculative is added.
PROBLEMS:
