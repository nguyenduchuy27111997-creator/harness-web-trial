# 0028: The grid placeholder cover shows one initial, not the title and author

Date: 2026-11-19 · Feature: F090 · Milestone: M9

## Context
Design M9 drew the `BookCover fill` placeholder as a designed cover with the title and author inset. In the desktop grid the same title and author sit right under the cover, so the review found every book named twice (F090-library-grid-light.png, F034-shelf-filter.png).

## Decision
The `fill` placeholder is a `bg-muted` 2:3 block with a hairline and one serif initial centered, the same as the phone rows. The title and author appear only under the cover. The `content-data` CSS utility that drew the repeated text is removed.

## Consequences
One placeholder look at every width; no duplicated name for find-in-page or screen readers to meet.
