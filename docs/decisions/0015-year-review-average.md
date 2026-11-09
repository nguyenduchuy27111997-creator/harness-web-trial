# 0015: Year in review average covers every rated read

- Date: 2026-11-09
- Status: accepted

## Decision
Supersedes 0013 for `/stats/<year>` only: its average rating is of every rated read finished that year (a re-read counts on its own), as `summarizeYear` in `docs/design/M6.md`. "Highest rated" lists every read tied for the top rating, even when there is one. `/stats` keeps the average of the books' current ratings.
