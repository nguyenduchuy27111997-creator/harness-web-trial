# F093: proposed "Specs that move" section for docs/design/M9.md (not yet PASSed)

### Specs that move

F093 replaces the inline Rename, Delete and Share buttons on `/shelves` and `/tags` with one "Actions for <name>" menu per row (UI, `/shelves`, `/tags`). Found with `grep -rln` over `e2e/` for `name: "Rename"`, `name: "Delete"`, `name: "Share"`, `"Stop sharing"`, `"Copy link"` on those pages. These specs and helpers count as F093's touches. Only the steps that reach a control change; every check stays.

- `e2e/rows.ts` (new helper): `rowAction(page, name, item)` clicks the button "Actions for <name>", then the `menuitem` `item`. `rowDialog(page)` is `page.getByRole("dialog")`.
- `e2e/shelves-rename.spec.ts` (F030): `row(X) Rename` becomes `rowAction(page, X, "Rename")`. The field, Save and Cancel are in the rename dialog, and the page-wide locators already find them there. The modal covers the page, so "open Book club while Travel is open" becomes "Cancel Travel, then open Book club". The checks (one field, its value, Save closes, the errors, Cancel discards) stay. Its baseline `F030-rename-taken` is redrawn with the dialog.
- `e2e/shelves-delete.spec.ts` (F033): `travel Delete` becomes `rowAction(page, "Travel", "Delete shelf")`. The alert dialog and its checks are unchanged.
- `e2e/F067-tags-page.spec.ts`: `row(X) Rename` becomes `rowAction(page, X, "Rename tag")`. The form and checks are unchanged (it is in the dialog), and the baseline `F067-tags-taken` is redrawn.
- `e2e/F083-share-shelf.spec.ts`: Share, Copy link, the link text and Stop sharing are read in `rowDialog(page)` after `rowAction(page, shelf, "Share")`, where they were read in the row. It checks the same things: a Share button before sharing, and Copy link, the `/s/<token>` link and Stop sharing after sharing (and none after stopping).
- `e2e/shelves.ts` `shareShelfLink`: the same move as F083 (F087 and others use it).
- `e2e/F084-share-nothing-private.spec.ts`: its inline share steps make the same move.
- `e2e/F087-m8-isolation.spec.ts`: Stop sharing and the check for the Share button that follows are read in the share dialog (`rowAction(page, shelf, "Share")` first).
- `e2e/F071-up-next.spec.ts` (F071), still to add (architect FAIL, 2026-11-17): Move up, Move down and Remove become `rowAction(page, <title>, ...)`. The "shown only where it applies" checks become checks on the open menu's `menuitem`s. The line-17 row locator finds rows by the "Actions for" button. Baseline `F071-up-next` is redrawn. F072's "Start reading <title>" checks stay.
- Baselines only (steps and checks unchanged), still to add: `F028-shelves` (shelves-create.spec.ts), `F029-shelf-name-taken` and `shelves-validation-end-{light,dark}` (shelves-validation.spec.ts), `F033-deleted` (shelves-delete.spec.ts).
