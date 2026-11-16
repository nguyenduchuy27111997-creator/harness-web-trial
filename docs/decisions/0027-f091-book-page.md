# 0027: F091 the book page

Builds `/books/[id]` to the M9 design (`docs/design/M9.md`, "Screens"). Choices the design left open:

- **Progress text.** `ProgressForm` shows the bar (`Progress`, `aria-label="Reading progress"`), "N of M pages" under it, and keeps today's "Page N of M (P%)" line. Existing specs and `formatProgress` (unit-tested) assert that line, so it stays; the bar and the shorter text are added beside it.
- **Delete.** `ConfirmDeleteButton` gets `triggerVariant` (default `outline`); the book page passes `destructive`. The trigger reads "Delete book" (a `label` prop; specs that matched "Delete" loosely still match it); the dialog heading becomes "Delete <title>?", as the design says.
- **Rating and Review** headings are `h2` (they were labels), so the sections read as Rating, Review, Notes, Quotes. The radiogroup and the textarea are named through `aria-labelledby`, so `getByLabel` and `getByRole` keep working.
- **Status badge.** The book page no longer shows `StatusBadge`; the segmented control shows the status.
- **Layout.** One DOM order (header, main sections, side sections, Delete); from `lg` the main sections and the side sections (edit, dates, shelves, tags, cover) are two columns, and Delete sits below both at every width.
- **Specs.** The status control is segments that save on pick, so specs that set status on the book page use `saveStatus` (`e2e/books.ts`); each spec edited for that ends with `expectScreens`. `book-save-buttons` no longer lists "Save status" (the button is gone by design).
