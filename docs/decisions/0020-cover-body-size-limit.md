# 0020: Server action body size limit raised to 3 MB for covers

- Date: 2026-11-14
- Status: accepted

## Context
M7 (`docs/design/M7.md`) set `serverActions.bodySizeLimit` in `next.config.ts` to `"2mb"` for the 1 MB CSV import. M8's cover upload (F081) sends an image of up to 2 MB through a server action; with the multipart encoding a 2 MB file does not fit under a 2 MB body limit.

## Decision
`serverActions.bodySizeLimit` becomes `"3mb"` (F081). The 2 MB cover limit is enforced by `parseCoverFile` and by the `covers` bucket's `file_size_limit`; the import's own 1 MB check is unchanged.

## Consequences
Replaces M7's `"2mb"` value; everything else in M7 stays. Any server action may now receive up to 3 MB.
