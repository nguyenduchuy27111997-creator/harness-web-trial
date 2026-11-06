# 0010: "Save quote" on the book page, and the older tests that click "Save"

- Date: 2026-11-06
- Status: accepted

## Context
F044 adds a "Save quote" button to every book page (design M5). Playwright's `getByRole("button", { name: "Save" })` matches by substring, so three older specs that click "Save" on the book page (`book-review`, `book-status`, `notes-add`) hit two buttons, and `book-save-buttons` listed the page's Save buttons as exactly "Save details" and "Save status".

## Decision
Keep the label the design and acceptance ask for. In those specs, name the button they mean ("Save status") and add "Save quote" to the expected list of distinct Save buttons. No assertion is removed. The book-page visual baselines that now show the Quotes section are updated.

## Consequences
New tests on the book page name their Save button in full (or use `exact: true`).
