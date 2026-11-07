# Replan

## 2026-11-07
- Why: the human chose M6 "reading history" and it was added to the spec.
- Added: F052 start date when Reading, F053 started/finished dates and days read, F054 edit dates, F055 date validation, F056 read again keeping past reads, F057 delete a past read, F058 stats count every read, F059 finished by month, F060 pages read this year, F061 year in review, F062 year in review ratings and year links, F063 reading history is private. Owner checks on F053, F056 and F061. Every feature has touches and depends_on; each acceptance step uses only features it depends on.
- Removed, re-opened, re-ordered: none. M1 to M5 scope is unchanged, so their designs stay as they are; M6 has no design doc yet and gets one from the loop.
- Decisions: `docs/decisions/0013-m6-replan.md`.
- The human approved the scope and the override for this one backlog commit in chat.

## 2026-11-06
- Why: the human added M5 "notes and quotes" to the spec (commit 10db501).
- Added: F040 write notes, F041 note validation, F042 edit a note, F043 delete a note, F044 save quotes, F045 quote validation, F046 edit a quote, F047 delete a quote, F048 quotes page, F049 quote search in the URL, F050 deleting a book deletes its notes and quotes, F051 notes and quotes are private. Owner checks on F040, F044 and F048.
- Removed, re-opened, re-ordered: none. M1 to M4 scope is unchanged, so their designs stay as they are; M5 has no design doc yet and gets one from the loop.
- Decisions: `docs/decisions/0009-m5-replan.md`.
- Not committed: the human reviews the changes and commits them.

## 2026-11-05
- Why: the human added M4 "shelves and progress" to the spec (commit ef773de).
- Added: F028 make a shelf, F029 shelf name validation, F030 rename a shelf, F031 put a book on shelves, F032 take a book off a shelf, F033 delete a shelf keeping its books, F034 filter by shelf in the URL, F035 record reading progress, F036 progress validation, F037 progress in the list, F038 finishing sets the page to the total. Owner checks on F028 and F037.
- Removed, re-opened, re-ordered: none. M1 to M3 scope is unchanged, so their designs stay as they are; M4 has no design doc yet and gets one from the loop.
- Decisions: `docs/decisions/0007-m4-replan.md`.
- The human reviewed the draft and approved it in chat.

## 2026-11-04
- Why: the human added M3 "keep the shelf tidy" to the spec (commit db9a2f8).
- Added: F018 edit title and author, F019 edit validation, F020 search kept in the URL, F021 search with no matches, F022 sort kept in the URL, F023 set a reading goal, F024 change the goal. Owner checks on F018 and F023.
- Removed, re-opened, re-ordered: none. M1 and M2 scope is unchanged, so their designs stay as they are; M3 has no design doc yet and gets one from the loop.
- Decisions: `docs/decisions/0005-m3-replan.md`.
- The human approved the re-plan and its commit in advance (replan arguments), so no stop for confirmation.
