<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-21T05:44:07 on fe15448 plus working tree
- Architect run: a803a6c30347d16ec
- Design sha256: 99efe864b016f31116b2742a03c53d9e1ad4b332ff6cbd344486d4a9643afa5a

VERDICT: PASS
DESIGN: M9
CHECKED:
- Contract (createBook, decision 0031): the code matches the doc. `/Users/huynguyen/Desktop/harness-web-trial-loop/F092/app/books/actions.ts` calls `revalidatePath("/books")`, then returns `{ saved: true }` when the form has `sheet=1`, and otherwise still runs `redirect("/books")`. Errors are unchanged: field errors and "Could not save the book. Try again." come back before that branch. `BookFormState` in `/Users/huynguyen/Desktop/harness-web-trial-loop/F092/lib/books.ts` is `FormState<...> & { saved?: true }`, as the doc says. The `sheet` flag only picks how the action responds; `requireUser` and RLS are untouched, so the threat model does not change.
- UI, Add sheet paragraph: matches `/Users/huynguyen/Desktop/harness-web-trial-loop/F092/app/books/new/new-book-form.tsx` and `/Users/huynguyen/Desktop/harness-web-trial-loop/F092/app/books/new/add-book-sheet.tsx`. The form adds the hidden `sheet=1` field only in sheet mode. `useEffect` calls `onSaved` when `state.saved` is set, and `AddBookSheet` passes `onSaved={close}`, which is the same close path Cancel, Escape and Discard use. `close` only calls `router.replace` while `pathname === "/books"` and `add` is in the URL. `/books/new` (no `sheet` prop) keeps its Save button and its redirect.
- Decisions: the updated line about the add sheet agrees with the Contract and UI text and with `docs/decisions/0031-f092-sheet-add-without-redirect.md`. 0031 says it replaces M1's always-redirect only for the sheet, so it does not conflict with the earlier design.
- Specs that move (F005): in `/Users/huynguyen/Desktop/harness-web-trial-loop/F092/e2e/add-book.spec.ts` only the submit step changed, to the dialog-scoped "Add book" button. The URL, Dune-row and `expectAccessible` checks are still there, and so is `toHaveScreenshot("F005-books-added.png")`. The added `expectScreens(page, "F005-books-added")` follows the Testing rule (line 95), and its staged light and dark baselines are named the way `expectScreens` names them (`<name>-<scheme>.png`). Nothing it checked is removed. `toHaveURL(/\/books$/)` still holds, because `close` replaces the URL with `/books` after the save.
- Rest of the doc: not re-reviewed; it had an earlier PASS and this diff does not change it.
PROBLEMS:
