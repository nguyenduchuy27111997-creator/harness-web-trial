# 0031: Adding from the sheet does not redirect

Date: 2026-11-21. Feature: F092. Decided by the dispatcher (decision 6), then confirmed by the human.

## Context
`createBook` always ran `redirect("/books")` (M1). In the add sheet (`/books?add=1`), that redirect plus `router.replace` in the sheet's close left an extra history entry. Back/Forward then brought back `/books/<id>` in a broken state (e2e/page-navigation-dom.spec.ts, F025).

## Decision
- When the form is posted from the sheet (hidden `sheet=1`), `createBook` returns `{ saved: true }` after `revalidatePath("/books")`. The sheet closes itself, and the new book is first in the list. `/books/new` still redirects.
- `AddBookSheet`'s close calls `router.replace` only while the path is `/books` and `?add=1` is set.
- The book page's Edit open state stays local `useState(false)`. It never comes from the URL or history state.

## Rejected
Redrawing the F025 baseline to accept the broken state. The architect already refused that.
