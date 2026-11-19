<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-19T16:57:22 on 19f12a3 plus working tree
- Architect run: af873fcae6b78d442
- Design sha256: d1210d904245bc0396da079c189d0b6daa219995e2f959cd0349d552d4772289

VERDICT: PASS
DESIGN: M9
CHECKED:
- Coverage: the change touches only the `BookCover` contract (line 35) and the phone-row wording of `/books` (line 73). F090's feature ("My books looks like a library: covers in a grid on a computer, rows on a phone") is still fully covered. The spec (spec.md:59, "the list and the book page show the cover, or a placeholder") is met by the one-initial placeholder.
- Contract vs code: `components/book-cover.tsx` matches the new line 35:
  - `SIZES.fill` is `h-15 w-10 text-headline` (the `sm` box) under `lg`, and `lg:aspect-2/3 lg:h-auto lg:w-full lg:text-large-title` from `lg`.
  - The placeholder is `bg-muted`, `border` (the hairline), `font-heading`, one uppercase initial centered, `aria-hidden`, with no title or author.
  - There is no `author` prop.
  - `components/book-list.tsx` renders `BookCover size="fill"` at every width, so line 73's "phone rows `BookCover fill`, which draws as `sm` there" is accurate. No caller passes `author=` (checked with grep across app/ and components/).
- Data model and migrations: none touched, no migration.
- Consistency with the rest of M9:
  - Line 68 ("F090 includes `dark:brightness-90` when it adds `fill`") agrees with the code: the image applies it for every size except `sm`.
  - Line 76 (shelves use `BookCover sm`), line 81 (`/s/[token]` uses `sm`, no `fill`) and line 82 (up-next `sm`) are unaffected. The callers in rename-shelf-form, up-next-list, s/[token] and books/[id] use `sm` or `lg` only.
  - `## Specs that move` (main's F030 shelves-rename entry and the others) mentions nothing about the placeholder's text. The only selector on the placeholder is `data-testid="cover-placeholder"`, and no spec uses it, so no moved spec depends on the removed title/author text.
- Decisions: the new decision 0029-f090-placeholder-cover-initial.md records what it replaces (M9's "designed cover" placeholder) and why (every book named twice in the grid). The rename from 0028 to 0029 avoids a clash with main's 0028-f093-moved-specs-end-with-expectscreens.md, and the doc cites 0029 correctly. No other decision describes the cover placeholder.
- design-system.md: line 19 ("the placeholder is `muted` with the hairline") agrees.
- NFR: unchanged. No new requests, surface or cost.
- Simplicity: the change removes things (the `author` prop and the `content-data` utility named in 0029) and adds no layer.
PROBLEMS:

Not a problem, and it predates this change (main's line 35 also omits it): the code's `className?` prop on `BookCover`, used by book-list and rename-shelf-form, is not in the contract line. You could add it next time line 35 is edited.

Files: /Users/huynguyen/Desktop/harness-web-trial-loop/F090/docs/design/M9.md, /Users/huynguyen/Desktop/harness-web-trial-loop/F090/docs/decisions/0029-f090-placeholder-cover-initial.md, /Users/huynguyen/Desktop/harness-web-trial-loop/F090/components/book-cover.tsx, /Users/huynguyen/Desktop/harness-web-trial-loop/F090/components/book-list.tsx
