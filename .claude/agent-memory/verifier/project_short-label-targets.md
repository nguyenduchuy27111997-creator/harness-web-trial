---
name: short-label-targets
description: min-h-11 text links pass on height but a 2-letter label (tag "ai") is 14px wide; seed short names and check width too, plus repeated cover alt text
metadata:
  type: project
---

Links fixed with `inline-flex min-h-11` are 44px tall, but their width is the text width. On /tags the tag "ai" was 14x44 at 390px (F093, 2026-11-18). The e2e gate catches it only if a spec seeds a short name.

**Why:** e2e specs use long fixture names, so width failures stay hidden.
**How to apply:** seed a one- or two-letter tag/shelf/book title before measuring touch targets. Also read `img` alt on stacked covers: /shelves gave every cover alt "Cover of <shelf name>". See [[inline-link-exemption]].

Follow-up 2026-11-19: fixed (tag link `flex-1`, "ai" 244x44). On /shelves measure the stacked covers vs their `w-16` box: three 40px covers at -space-x-6 are 72px wide, so they overflow by 8px and the "gap-4" reads as 8px. Cover alt stays "Cover of <shelf>" because a locked spec counts the imgs.
