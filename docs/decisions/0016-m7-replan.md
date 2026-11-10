# 0016: Re-plan for M7

- Date: 2026-11-10
- Status: accepted

## Context
The human approved M7 in chat on 2026-11-10: tags, CSV import and export, an Up next queue, and account settings. M7 is also the trial of harness-kit v9 (DESIGN.md section 16): about 12 features in groups that touch few files in common, to measure how soon a milestone finishes with e2e on GitHub's runners and the dispatcher planning the milestone. CSV import and export were out of scope; the human brought them in.

## Decision
- Backlog: add F064-F075 (M7). No existing feature is removed, re-opened or re-ordered. Owner checks on F064, F069 and F074.
- Groups: tags (F064-F067), import and export (F068-F070), Up next (F071-F072), account (F073-F074), and isolation across them (F075).
- The header gains Tags, Import / export, Up next and Settings links; several features touch it, so the design doc should settle the header once.
- The loop runs M7 after kit P35 (the dispatcher plans the milestone in waves).

## Consequences
- M7 needs a design doc (`docs/design/M7.md`), written by the loop before F064: `tags` and `book_tags`, a queue table, a profile table, all with RLS on the owner and cascades from books and users, and the CSV format in one place.
- M1 to M6 designs are unchanged.
