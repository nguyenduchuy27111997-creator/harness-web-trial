# 0003: Rating form button label and controlled value

- Date: 2026-11-03
- Status: accepted

## Context
Design M2 says the rating form has a "Save button" and a `defaultValue` equal to the saved rating. F010's e2e test (which must not change) finds the status form's button with `getByRole("button", { name: "Save" })`, a substring match; a second button whose name contains "save" on a Finished book makes it ambiguous. Also, React's automatic form reset after an action makes Radix radios revert to their first-rendered value, so an uncontrolled group shows the old rating after saving.

## Decision
- The rating form's submit button is labelled "Rate" ("Saving…" while pending).
- The review form (F012) likewise uses "Post review" ("Saving…" while pending). Only the Status form's button may have "save" in its name on the book page, because Playwright matches names as case-insensitive substrings ("Save review" would clash too).
- The `RadioGroup` is controlled (`value` state initialised from the saved rating) and the form is submitted by hand (`preventDefault` + `startTransition(formAction)`), which skips the automatic reset.

## Consequences
- The rating form needs JavaScript to submit.
