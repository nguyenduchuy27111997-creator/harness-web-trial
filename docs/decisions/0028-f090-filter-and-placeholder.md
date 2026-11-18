# 0028: /books filter layout and the placeholder cover, as built in F090

Status: accepted (F090, owner accepted 2026-11-18)

The review of F090 found four places where the built /books differs from design M9. The owner accepted the built behavior; this record makes it the design, and M9 is updated to match.

1. **Status filter under 640 px is a 2x2 grid, not a sideways scroll.** Four equal 44 px segments (`grid grid-cols-2`), no `overflow-x-auto`, snap or scroll-into-view. Every count is visible at 320 px and at 200% text without hidden segments. Rejected: the sideways scroll M9 described, which hid segments off screen (the designer's bug on F090).
2. **From 640 px the StatusTabs segments are 28 px tall in a 36 px track.** This overrides M9's segmented-control sizes (44 px under `lg`, 32 px from `lg`) for `StatusTabs` only; `BookStatusForm` keeps 44/32. With a fine pointer the track is the same 36 px height as the Sort trigger, search field and button; the track and Sort share a centre line, and search has its own row above. With a coarse pointer from 640 px (a touch tablet), `app/ui-base.css` raises Sort and search to 44 px, but the status links are plain links that stay 28 px in the 36 px track. That is an accepted exception to the ui-guide's 44 x 44 px touch-target rule, and no test checks it (e2e/a11y.ts checks only 390 px). Revisit in a tablet-specific pass.
3. **The /books filter row wraps.** `flex flex-wrap items-center gap-4`. At 1024 px, with shelf and tag selects present, Sort (or a select) can move to a second line. Wrapping is preferred to horizontal overflow or shrinking the controls under 36 px.
4. **The designed placeholder cover from 1024 px** shows the title (`line-clamp-5`) and author (`line-clamp-2`) inset on the muted card, and the same title and author are repeated as text under the cover. A long title is cut by the clamp on the card; the full title is in the text below, and the cover is `aria-hidden`, so screen readers read it once.
