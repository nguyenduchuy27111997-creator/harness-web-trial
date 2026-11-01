# Design system

The look of the product, in one place. `/kickoff` fills it from the spec's Look and feel; the `designer` subagent reviews every UI change against it. Tokens live in `app/globals.css` (CSS variables used through Tailwind classes such as `bg-primary`), base components in `components/ui/` (shadcn/ui), and `/styleguide` shows them all.

## Style
Warm and bookish, like a small independent bookshop's site or Literal. Light theme only (there is no dark theme). Cream paper background, dark brown-black ink, one accent: deep green for primary buttons, links and focus rings. Calm and roomy: comfortable spacing, few borders, no shadows beyond the card's default. Book titles and headings are serif; everything else is the system sans.

## Tokens
- Colors: `background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` (each with `-foreground` where text sits on it). `background` cream page; `foreground` brown-black text; `card`/`popover` slightly lighter cream for book rows and dialogs; `primary` deep green (about #166534) for primary buttons and links, `primary-foreground` cream on it; `secondary`/`muted` warm beige for secondary buttons, badges and quiet surfaces, `muted-foreground` for helper text and dates; `accent` pale green for hover and the selected tab; `destructive` brick red for delete and field errors; `border`/`input` warm beige lines; `ring` green focus ring.
- Radius: `--radius` = 0.375rem (6px, `rounded-lg`); type: Lora (serif, `font-heading`, applied to h1-h3 and book titles) and the system sans stack (`font-sans`, everything else), scale `text-sm` to `text-4xl`; spacing: the Tailwind scale only.

## Components
- Use `components/ui/*` for every button, input, label, card, dialog and the like; add a missing one with `npx shadcn@4.21.3 add <name>` instead of building it.
- A component used in two or more places goes in `components/`, built from `components/ui/`.

## Layout and states
- One centered column, `max-w-3xl` with `px-4` on phones and `p-8` from `sm:`; single column at every width. Header with the app name and Sign out on top. Sections are spaced `gap-6` to `gap-8`, rows in a list `gap-3`.
- Status badges: Want to read = `secondary`, Reading = `accent`, Finished = `primary`.
- Every list has an empty state, every form shows validation and server errors next to the field, every async action shows it is working.

## Rules (enforced)
- Only token colors and the Tailwind scale: no hex, rgb, hsl or oklch values, no Tailwind palette colors (`bg-red-500`), no arbitrary values (`p-[13px]`) outside `app/globals.css` and `components/ui/`. `scripts/ui-tokens.py` (in `check.sh`) fails on them.
- No raw `<button>`, `<input>`, `<select>`, `<textarea>` outside `components/ui/`.
- Each UI feature's e2e test ends with a `toHaveScreenshot` of its final state: the visual baseline. Changing another feature's baseline needs the change to be in your feature's acceptance; the designer checks.
