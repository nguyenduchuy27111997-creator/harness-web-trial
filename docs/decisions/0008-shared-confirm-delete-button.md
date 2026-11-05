# 0008: Delete buttons share `ConfirmDeleteButton`

- Date: 2026-11-06
- Status: accepted

## Context
F033 adds `delete-shelf-button` (design M4), an alert dialog with Cancel and Delete, the same shape as `delete-book-button`. Copying it put the code over the jscpd duplication budget (3%).

## Decision
- New `components/confirm-delete-button.tsx` (`ConfirmDeleteButton`: heading, description, optional `size`, bound action). `DeleteBookButton` and `DeleteShelfButton` are thin wrappers with their own text; their props and the book page are unchanged.
- The F033 e2e test builds its data with helpers in `e2e/shelves.ts` (`createShelves`, `addBookOnShelf`) for the same reason. Each test still signs up and builds its own data (principle 6).

## Consequences
- The design's component list stays true; one shared component is added beside it. The book dialog's text and look are unchanged.
