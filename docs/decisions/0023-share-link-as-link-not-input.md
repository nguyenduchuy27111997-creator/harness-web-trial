# 0023: The shelf share link is a labelled link, not a read-only Input

- Date: 2026-11-14
- Status: accepted

## Context
A review of F083 asked for the share URL to be shown in a read-only `components/ui/input` with aria-label "Share link". The locked test `e2e/F083-share-shelf.spec.ts` reads the URL with `getByText(/\/s\/[0-9a-f]{48}/).textContent()`. An input's value is not text content, so the Input would fail that test, and changing the locator goes beyond a wait, which the loop rejects. Earlier sessions put the choice to the human (`harness/log/F083.md`, 18:10 and 18:40). The 19:20 entry says the human picked the link and left the test alone. That approval is not written down anywhere except that agent log, so this file is now its record. If the human did not approve it, change Status to proposed and raise it again.

## Decision
`components/share-shelf.tsx` shows a visible "Share link" label, then the URL as an `<a href>` styled like other links (`text-primary`, underline on hover, system sans, `truncate` to keep one line). The link's accessible name comes from `aria-labelledby` on the label plus the link itself, so a screen reader hears "Share link" and then the full URL.

## Consequences
On narrow screens the URL is cut short on screen. You can still get the full URL from Copy link, from the link's href and from its accessible name. If someone later wants the full token selectable on screen, swap in the Input, and in the same change update the test's `linkText` locator to `getByRole('textbox', { name: 'Share link' }).inputValue()`. That change needs a human's approval.
