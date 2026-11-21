<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-21T09:53:52 on 61df9863 plus working tree
- Architect run: a23e0fd918d23a972
- Design sha256: 8a5bfb39c51fc986715f558df6e63fc4e16bb95e6377528426f564f3c1abcb59

VERDICT: PASS
DESIGN: M9
CHECKED:
- Scope of the change: `git diff HEAD -- docs/design/M9.md` shows only one new bullet, at the end of the F091 part of `## Specs that move` (line 136). The rest of the design is the same as the content behind the last committed PASS.
- Specs that move: I ran `grep -rn 'data-slot=card' e2e/`. Before the edit it matched only `e2e/F064-tags-book.spec.ts` and `e2e/F065-tag-validation.spec.ts`, and both are listed. The working-tree diff of each spec changes only the `mask:` array of the `toHaveScreenshot` call, and the new array is exactly the one the design states. All assertions, the screenshot names (`F064-book-tagged.png`, `F065-tags-full.png`), `fullPage` and `stylePath` are unchanged. So it moves a step and removes no check.
- The old mask really is broken: in `app/books/[id]/page.tsx` the top block is now a `<header>`, not a Card. The only Cards left on the page are in `components/book-notes.tsx` and `components/past-reads.tsx`, and they render one per note or past read. Neither test creates any, so `[data-slot=card]` matches nothing and the per-run title would go unmasked, as the bullet says.
- Nothing per-run left unmasked, compared with what was on the page:
  - Title: the `h1` is `<prefix> <lane>-<Date.now()>`; masked by `getByRole("heading", { level: 1 })`.
  - Start date: "Started on <today>" (`components/reading-dates.tsx`) is masked by `getByText(/(Started|Finished) on/)`.
  - Cover: placeholder initial is "T" for both "Tagged …" and "Tag rules …", so it is stable.
  - Author: always "George Eliot" (`e2e/books.ts`).
  - Tags: fixed names.
  - Dates editor: "Edit dates" stays closed, so no date inputs show.
  - Delete: the button label is a constant "Delete book". The title only appears in the confirm dialog, which is not open.
  - Navigation: the shell's links are not per-run, and the old mask never covered them either.
- Checks more, not less: the old mask hid the whole top card. The new one hides only the title and the date line, so the cover, author, status control and Edit details are now compared. The bullet states this correctly.
- Consistency:
  - The title mask is the one `e2e/F081-cover-upload.spec.ts:84` already uses.
  - The date mask is the same regex as the added `expectScreens` steps in the bullet at line 134.
  - Redrawing both baselines matches the "Baselines only" bullet's approach for `/books/[id]` shots.
  - No conflict with the data model, contract, modules or decisions: no schema, route or module change.
- Simplicity: the change is limited to the two broken masks. Nothing speculative is added.
PROBLEMS:

Note (not a problem with the design): the working tree has the two spec edits, but `F064-book-tagged` and `F065-tags-full` have not been redrawn yet. The bullet requires both, in light and dark, before the feature commit.

Files: /Users/huynguyen/Desktop/harness-web-trial-loop/F091/docs/design/M9.md, /Users/huynguyen/Desktop/harness-web-trial-loop/F091/e2e/F064-tags-book.spec.ts, /Users/huynguyen/Desktop/harness-web-trial-loop/F091/e2e/F065-tag-validation.spec.ts, /Users/huynguyen/Desktop/harness-web-trial-loop/F091/app/books/[id]/page.tsx
