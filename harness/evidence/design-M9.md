<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-21T07:28:33 on 96b42a2 plus working tree
- Architect run: aabc8646b64d92e40
- Design sha256: 6af5606adba1b06377ebe313ad3a19410b88fbe3aac4e76ed87e9dd8b3188240

VERDICT: PASS
DESIGN: M9
CHECKED:
- Coverage: I checked all nine M9 features (F088 to F096) against the Components, UI screens, Specs that move and Shared scaffold sections. Each acceptance line maps to a screen, component or contract. F091's third line ("Delete sits at the bottom in red and asks to confirm, naming the book") is now covered by the new `ConfirmDeleteButton` props bullet (`triggerLabel`, `triggerVariant`, heading "Delete <title>?") and by the `/books/[id]` screen text.
- Data model and migrations: M9 adds no migration ("No migration" in Shared scaffold). `listShelfSummaries` reads existing tables under the existing RLS. Nothing new to check here.
- Contract: The prop changes for `ConfirmDeleteButton`, `BookCover`, `BookStatusForm` and `StatusTabs` are stated with their inputs. The new `ConfirmDeleteButton` props are optional and default to today's behaviour, so the other callers (notes, quotes, past reads, shelves) stay as they are.
- Consistency: The new `/Users/huynguyen/Desktop/harness-web-trial-loop/F091/docs/decisions/0032-f091-delete-book-names-book.md` records that it replaces decision 0008's "the book dialog's text and look are unchanged", for the book page only. The design bullet cites it. No other conflict found with decisions 0027 to 0031 or the earlier designs.
- Specs that move: I re-ran the greps the doc names.
  - `Save status` and `Delete this book` / `name: "Delete"` give the files the F091 block lists.
  - `name: "Edit"` gives exactly `edit-book.spec.ts:19,28,44`, `edit-book-validation.spec.ts:19,48,59` and `page-navigation-dom.spec.ts:51`, which the doc lists as unchanged. That is correct: `components/edit-book-form.tsx` now renders "Edit details", and a Playwright name match that is not exact matches a substring, so "Edit" still finds "Edit details".
  - `book-save-buttons.spec.ts` uses the exact name "Edit details", and the doc lists that rename.
  - `F086-live-list.spec.ts:44` uses a non-exact "Delete", which still matches "Delete book". The doc lists it as unchanged, which is right.
  - The status changes keep each check's meaning: combobox `toContainText` becomes radio `toBeChecked`, and a count of 1 stays a count of 1 on the radiogroup. The only check whose premise goes away ("a pick alone does not save") is replaced with an equivalent assertion. The new `expectScreens` steps add checks and remove none.
- UI: The `/books/[id]` layout is given per width (phone, tablet 768 px+, desktop 1024 px+), with the primary control (the status segments), the button hierarchy, where "Edit details" sits, Delete last in red with a dialog that names the book, and not-found unchanged. The progress text from `formatProgress` stays on the page as `sr-only`, so the specs that read it keep working. The rest of the M9 screens are unchanged from the doc that last passed.
- Module boundaries: Components stay under `components/` and data stays under `lib/`. No new layers or import rules.
- NFR: Unchanged from the version that last passed. M9 is visual only: no new data, load or cost.
- Simplicity: The two new optional props are the minimum that lets the book page differ while the other callers stay the same. Nothing speculative.
PROBLEMS:

Notes:
- Formatting only, not a defect: in Specs that move, the paragraph starting "F091 drops the "Save status" button…" comes straight after the last F092 bullet with no blank line, so Markdown may render it as part of the `status-filter.spec.ts` bullet. A blank line before it would fix that.
- Not new in F091: the non-exact `name: "Edit"` would also match "Edit dates" wherever that button is on the page. The old "Edit" button had the same overlap, so this design does not change how those specs behave.
