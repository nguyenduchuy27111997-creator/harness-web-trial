# 0024: M9 redesign: light and dark, adaptive navigation, lookup matches

- Date: 2026-11-16
- Status: accepted

## Context
The human added M9 (F088-F096) on 2026-11-16: the app rebuilt on `docs/ui-guide.md`. Its acceptance asks for things the spec and earlier designs ruled out or shaped differently: a dark look (the spec's Look and feel says "Light theme only"), Inter for UI text (the spec says system sans), a sidebar and a tab bar instead of one header, lookup results as several matches with covers (M8 returns one book), and status as a segmented control.

## Decision
- Light and dark follow the system setting, with no setting in the app. Inter is the UI font; Lora stays for page titles, book titles and quotes. This replaces the spec's "Light theme only" and "system sans"; `docs/design-system.md` is rewritten by F088.
- `GET /api/lookup` returns `{ status: "found", books: LookupBook[] }` (1 to 5 matches, each with `coverUrl`), replacing M8's `{ status: "found", book }`. Lookup covers are shown, never saved.
- Sign out moves into an account menu; status saves on pick from a segmented control ("Save status" goes); picking a lookup match fills the form. Specs that sign out, set a status or look up a book change how they do it (through `signOut`, `saveStatus` and the match buttons), never what they check, in the feature whose acceptance makes the change (F089, F091, F092).

- Exception: F092 changes `e2e/empty-shelf.spec.ts`'s URL check from `/books/new` to `/books?add=1`, since its acceptance moves where Add book goes.

## Consequences
- `docs/design/M9.md` holds the details. M1 to M8 designs are unchanged apart from M8's lookup result shape.
- F088 regenerates every visual baseline in light and dark.
