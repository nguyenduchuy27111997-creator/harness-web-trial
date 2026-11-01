# Design system

The look of the product, in one place. `/kickoff` fills it from the spec's Look and feel; the `designer` subagent reviews every UI change against it. Tokens live in `app/globals.css` (CSS variables used through Tailwind classes such as `bg-primary`), base components in `components/ui/` (shadcn/ui), and `/styleguide` shows them all.

## Style
<one paragraph: mood, density, the products it should feel like, light or dark>

## Tokens
- Colors: `background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` (each with `-foreground` where text sits on it). <what each is for>
- Radius: `--radius` = <value>; type: <font family>, scale `text-sm` to `text-4xl`; spacing: the Tailwind scale only.

## Components
- Use `components/ui/*` for every button, input, label, card, dialog and the like; add a missing one with `npx shadcn@4.21.3 add <name>` instead of building it.
- A component used in two or more places goes in `components/`, built from `components/ui/`.

## Layout and states
- <page width, grid, how sections are spaced>
- Every list has an empty state, every form shows validation and server errors next to the field, every async action shows it is working.

## Rules (enforced)
- Only token colors and the Tailwind scale: no hex, rgb, hsl or oklch values, no Tailwind palette colors (`bg-red-500`), no arbitrary values (`p-[13px]`) outside `app/globals.css` and `components/ui/`. `scripts/ui-tokens.py` (in `check.sh`) fails on them.
- No raw `<button>`, `<input>`, `<select>`, `<textarea>` outside `components/ui/`.
- Each UI feature's e2e test ends with a `toHaveScreenshot` of its final state: the visual baseline. Changing another feature's baseline needs the change to be in your feature's acceptance; the designer checks.
