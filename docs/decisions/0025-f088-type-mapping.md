# 0025: F088 maps Tailwind sizes to the named text styles one for one; not-found links keep their text

- Date: 2026-11-16
- Status: accepted

## Context
F088 replaces every `text-sm`/`text-2xl`-style class with a named style (docs/design/M9.md). The design names the page titles only. It also says the `not-found.tsx` files take a "Go to my books" link, while `e2e/book-page.spec.ts` and `e2e/book-not-found.spec.ts` (other features' specs, which may not change) look for "Back to my books".

## Decision
- Sizes map to the style of the same or nearest size: `xs` caption, `sm` subheadline, `base` body, `lg` headline, `xl` title-3, `2xl` title-2, `4xl`/`5xl` large-title; detail pages (a book, a year, a shared shelf, not found) take title-1. Later M9 features restyle their own screens.
- The not-found pages keep the "Back to my books" link text and only take the new type.

## Consequences
No spec changes; the names stay greppable per screen for F089-F096.
