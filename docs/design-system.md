# Design system

The look of the product, in one place. `/kickoff` fills it from the spec's Look and feel; the `designer` subagent reviews every UI change against it. Tokens live in `app/globals.css` (CSS variables used through Tailwind classes such as `bg-primary`), base components in `components/ui/` (shadcn/ui), and `/styleguide` shows them all.

## Style
Warm and bookish, like a small independent bookshop's site or Literal, built on `docs/ui-guide.md`. Light and dark follow the system, with no setting (decision 0024). Light: cream paper background, dark brown-black ink. Dark: warm dark background, cream text (never pure white), a lighter green; elevation by lightness and the hairline, no shadows. One accent: green for primary buttons, links and focus rings. Calm and roomy: comfortable spacing, few borders. Page titles, book titles and quotes are Lora; everything else is Inter.

## Tokens
- Colors: `background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` (each with `-foreground` where text sits on it). `background` cream page; `foreground` brown-black text; `card`/`popover` slightly lighter cream for book rows and dialogs; `primary` deep green (about #166534) for primary buttons and links, `primary-foreground` cream on it; `secondary`/`muted` warm beige for secondary buttons, badges and quiet surfaces, `muted-foreground` for helper text and dates; `accent` pale green for hover and the selected tab; `destructive` brick red for delete and field errors; `border`/`input` warm beige lines; `ring` green focus ring; `chart-1` the green for graphics (month bars, goal ring). Every token has a dark value in `@media (prefers-color-scheme: dark)` in `app/globals.css` (no `.dark` class).
- Radius: `--radius` = 0.375rem (6px, `rounded-lg`); type: Lora (`font-heading`, applied to h1-h3, book titles and quotes) and Inter (`font-sans`, everything else), both self-hosted by `next/font`; sizes only through the named text styles in `app/ui-base.css` (`text-large-title`, `text-title-1` to `-3`, `text-headline`, `text-body`, `text-callout`, `text-subheadline`, `text-footnote`, `text-caption`, `text-caption-2`), never `text-sm`/`text-2xl`; top-level page titles `text-large-title`, detail pages `text-title-1`; spacing: the Tailwind scale only.

## Components
- Use `components/ui/*` for every button, input, label, card, dialog and the like; add a missing one with `npx shadcn@4.21.3 add <name>` instead of building it.
- A component used in two or more places goes in `components/`, built from `components/ui/`.

## Layout and states
- Layout per width and navigation: `docs/design/M9.md` `## UI` (sidebar from `lg`, tab bar below; row lists `max-w-3xl`, forms `max-w-xl`, prose `max-w-prose`). On a phone every button and field is at least 44 px tall (`app/ui-base.css`). Sections are spaced `gap-6` to `gap-8`, rows in a list `gap-3`.
- Status badges: Want to read = `secondary`, Reading = `accent` tint, Finished = `outline` with a check icon; the label is always text. Filled `primary` is for the one primary button per view.
- Covers: size `lg` is dimmed a little in dark (`dark:brightness-90`); the placeholder is `muted` with the hairline.
- Every list has an empty state, every form shows validation and server errors next to the field, every async action shows it is working.

## Rules (enforced)
- Only token colors and the Tailwind scale: no hex, rgb, hsl or oklch values, no Tailwind palette colors (`bg-red-500`), no Tailwind text sizes or off-grid spacing, no arbitrary values (`p-[13px]`) outside `app/globals.css` and `components/ui/`. `scripts/ui-tokens.py` (in `check.sh`) fails on them.
- No raw `<button>`, `<input>`, `<select>`, `<textarea>` outside `components/ui/`.
- Each UI feature's e2e test ends with a `toHaveScreenshot` of its final state: the visual baseline. Changing another feature's baseline needs the change to be in your feature's acceptance; the designer checks.
