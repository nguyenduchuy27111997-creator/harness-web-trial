<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-19T16:49:09 on 86e5c13 plus working tree
- Architect run: ac7830cf1601be2de
- Design sha256: 835933bc7c9857a1973542bce5fbed6cd0e3d03021235613a2573d68c5a0895f

VERDICT: PASS
DESIGN: M9
CHECKED:
- Scope of change: `git diff docs/design/M9.md` changes only the `BookCover` line under "Components whose props change". The `author?` prop is dropped and the `fill` placeholder becomes a `bg-muted` 2:3 block with a hairline and one centered `font-heading text-large-title` initial. It is still `aria-hidden`, and it cites decision 0028. Nothing else in M9 changed.
- Decision: /Users/huynguyen/Desktop/harness-web-trial-loop/F090/docs/decisions/0028-f090-placeholder-cover-initial.md gives the context (the title and author showed twice in the grid), the decision (one initial, as on the phone rows, and the `content-data` utility removed) and the consequences. The number 0028 is not used by any other file (0027 has three files, which was already the case).
- Coverage and spec: F090's acceptance only asks for "a grid of covers with title and author under each". The UI section of M9 (line 73) still puts the title (`line-clamp-2`) and author (`line-clamp-1`) under `BookCover fill`, so the acceptance is still met. Spec M8 only asks for "the cover, or a placeholder".
- Code: /Users/huynguyen/Desktop/harness-web-trial-loop/F090/components/book-cover.tsx takes `{ title, url, size, className? }` with no `author`. The placeholder is `aria-hidden`, has `border bg-muted font-heading` and shows the first letter of the title, with `fill` at `lg:aspect-2/3 lg:w-full lg:text-large-title`. No caller passes `author=` to `BookCover`. The only `author=` is on `EditBookForm`. `content-data` is gone from `app/*.css` and the code. `text-large-title` is defined in `app/ui-base.css`. Commit f80c5d1 touches only book-cover.tsx, book-list.tsx and globals.css.
- design-system.md: line 19 ("the placeholder is `muted` with the hairline") and the type rules (Lora through `font-heading`, named sizes only) match the new wording. Nothing in it described the old title/author placeholder, so it needs no change.
- Rest of M9: line 68 (covers in dark: the placeholder uses dark `muted` and the hairline) and line 81 (`/s/[token]` uses `sm`, no `fill`) agree. `sm` and `lg` are unchanged.
- Specs that move: `grep -rn "cover-placeholder|content-data" e2e` finds nothing. No e2e spec reads the placeholder's text, so no spec moves.
- Contract, data model, NFR, module boundaries: none of these change. This is a presentational prop change only.
- Simplicity: the change removes a prop and a CSS utility and adds nothing.
PROBLEMS:
