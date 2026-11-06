# 0011: Quote "Delete" button changes the F044 baseline

- Date: 2026-11-06
- Status: accepted

## Context
F047 adds a "Delete" button to each quote on the book page (design M5). The F044 visual baseline shows three quotes, so it now shows their buttons.

## Decision
Update `F044-quotes.png` only. Specs that look for the book's own "Delete" button have no quotes on the page, so they are unaffected; new tests on a book with quotes scope the button to the quote's list item.

## Consequences
F046 (Edit) will add its button to the same row and update this baseline again.
