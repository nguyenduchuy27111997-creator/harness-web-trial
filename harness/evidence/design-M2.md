<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-03T01:16:59 on 0e0226e plus working tree
- Architect run: a9dcd096139401f78
- Design sha256: 8f510fdff29d02872f058aac838896d5f660fdd519a5d04b1848908217f0e46b

VERDICT: PASS
DESIGN: M2
CHECKED:
- Scope of change: `git diff HEAD -- docs` changes only the `/books/[id]` route row and the closing line of the Decisions section in /Users/huynguyen/Desktop/harness-web-trial-loop/F011/docs/design/M2.md. In the route row, the rating form is now a controlled `RadioGroup` submitted by a "Rate" button, and the review form's button is now "Post review". The closing line now cites decision 0003. The data model, migrations, contract (`saveRating`/`saveReview`, the parse and update functions, the form states), module rules and NFR are unchanged from the approved version, so I re-checked only what the change could affect.
- Previous FAIL (review form "Save" clash): fixed. The review form's button is "Post review". Its pending label "Saving…" does not contain "save" as a substring ("savi…"). /Users/huynguyen/Desktop/harness-web-trial-loop/F011/docs/decisions/0003-rating-form-details.md now covers the review form and states the rule: only the Status form's button may have "save" in its name on the book page. On a Finished book, the only button whose name matches `getByRole("button", { name: "Save" })` (case-insensitive substring) is the Status form's. So /Users/huynguyen/Desktop/harness-web-trial-loop/F011/e2e/book-status.spec.ts line 48 stays unambiguous with F011 and F012 in place.
- Other button names on the page: Save (status), Rate, Post review, Delete, and Cancel (in the dialog). None contains "rate" or "post review" except its own button, so `getByRole("button", { name: "Rate" })` in /Users/huynguyen/Desktop/harness-web-trial-loop/F011/e2e/book-rating.spec.ts is also unambiguous.
- Coverage: F011's acceptance still maps to the design (stars shown only while Finished; 4 and then 2 survive a reload). F012's acceptance says "type a review … and save", which is a generic action, so a "Post review" button meets it. The 2,000-character error and keeping the old review are unchanged in `parseReview`/`saveReview`.
- Consistency: decision 0003 has context, decision and consequences, and the doc cites it. Decision 0002 ("saved independently") is kept by the three separate forms. Nothing in M1 or decisions 0001 and 0002 conflicts.
- Simplicity: the controlled group and manual submit are justified by React's form reset reverting Radix radios. The button labels are the minimum change. Nothing speculative was added.
PROBLEMS:
