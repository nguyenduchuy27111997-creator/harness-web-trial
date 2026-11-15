# UI guide

How a screen should look and behave, for every product with a UI. It is anchored on Apple's Human Interface Guidelines (HIG), translated to the web, and it applies on top of `docs/design-system.md` (this product's brand: colors, fonts, radius). Coders build to it; the `designer` subagent scores every screen against the rubric at the end. Where a rule has a number, the number is the rule.

Sources: Apple HIG (https://developer.apple.com/design/human-interface-guidelines/: layout, typography, color, dark mode, materials, motion, accessibility, writing, buttons, lists and tables, sidebars, tab bars, sheets, loading, feedback, entering data, searching, onboarding, managing accounts), WCAG 2.2, motion.dev, NN/g progress indicators, Baymard inline validation, rsms.me/inter. Research notes: 2026-11.

## 1. Principles
- **Hierarchy first.** The most important content and the one primary action sit at the top and leading side. A screen has one obvious next step.
- **Content over chrome.** Controls and navigation are a separate layer that floats above content (Apple's 2025 Liquid Glass model). Content stays flat and calm; only the navigation layer gets material, blur or elevation.
- **Group with one tool at a time:** space, a container, or a separator. Never all three. Space between groups is larger than space inside a group.
- **Progressive disclosure.** Show what most people need; put the rest one step away (a menu, a disclosure, a detail view).
- **Adapt by width, not by device.** The same functions at every width; only how much is shown changes (a tab bar becomes a sidebar, overflow items come out of the menu).
- **Nothing is said by color or motion alone.** Pair it with text, an icon or a shape.
- **Restraint.** Every visual element has a job. If it only decorates, remove it.

## 2. Layout
- Spacing: a 4 px grid, mostly multiples of 8 (Tailwind 1 unit = 4 px: use 1, 2, 3, 4, 6, 8, 12, 16 ...; not 1.5, 2.5, 7, 9).
- Breakpoints and the adaptation ladder (the milestone's design doc says which a screen uses):
  - under 768 px: one column; top bar plus a bottom tab bar or a compact menu with at most 5 destinations; dialogs become bottom sheets;
  - 768 to 1023 px: a collapsible sidebar or two-column grids;
  - 1024 px and up: a persistent sidebar (or top navigation) plus content that uses the width: grids of cards, a table, or list and detail side by side;
  - 1280 px and up: optionally three panes (sidebar, list, detail).
- An app is not a narrow centered column on a wide screen. Limit **prose** to about 65 characters (`max-w-prose`), not the app shell.
- Sidebar: at most 2 levels; group sections with headings; let people hide it but show it by default; one familiar icon per item.
- Fixed bottom bars and sheets respect safe areas (`env(safe-area-inset-bottom)`). On desktop, keep critical controls out of the bottom edge.
- Rows: 44 px minimum on touch, 32 to 40 px in dense desktop lists. Leading icon or image, title plus one secondary line, trailing meta or chevron.

## 3. Typography
- One family (the product's UI font; Inter by default). A brand display face for headings only if the design system says so.
- Use the named text styles, never ad-hoc sizes. Web sizes in px (size/line height, weight):

| Style | Use | Size |
|---|---|---|
| large-title | the page title on top-level screens | 34/40, 700 |
| title-1 | page title on detail screens | 28/34, 700 |
| title-2 | section title | 22/28, 700 |
| title-3 | card or group title | 20/28, 600 |
| headline | row title, emphasized body | 17/24, 600 |
| body | running text, inputs | 16/24 |
| callout | secondary blocks, buttons | 15/22 |
| subheadline | dense UI text, table cells | 14/20 |
| footnote | metadata, helper text | 13/18 |
| caption, caption-2 | labels on images, timestamps | 12/16, 11/13 |

- Three or four styles per screen. Build hierarchy from size, weight and color together.
- Weights: regular, medium, semibold, bold. Never thin or light.
- Large headings track tighter (about -0.01 to -0.022 em); body text never tracks positive; all-caps labels track +0.02 to +0.05 em.
- Numbers that line up (tables, stats, prices, timers) use tabular figures (`tabular-nums`) and right-align in columns.
- Text scales to 200% without breaking: sizes in rem, rows grow, horizontal groups wrap.

## 4. Color
- Semantic tokens only (`background`, `foreground`, `muted-foreground`, `primary`, `destructive`, ...), each used for one meaning. Never reuse a background token as text.
- Label hierarchy: `foreground` (primary), `muted-foreground` (secondary), one subtler level for placeholders and disabled text. Every level still meets contrast.
- One accent (`primary`) marks what is interactive or the primary action. Do not color non-interactive text with it. At most one or two filled accent buttons per view.
- Neutrals carry a trace of the brand hue (OKLCH chroma about 0.005 to 0.015) instead of pure grays.
- **Light and dark follow the system setting.** Dark is designed, not inverted:
  - no pure black page and pure white text; raised surfaces (card, popover, dialog) are lighter than the page, about +0.04 to +0.06 OKLCH lightness per level;
  - elevation in dark shows by lighter surfaces and a 1 px light hairline (`oklch(1 0 0 / 10%)`), not shadows;
  - slightly dim large white images.
- Contrast: text 4.5:1 (3:1 at 24 px and up, or 19 px bold); aim for 7:1 for small text in dark; borders of inputs, focus rings and meaningful icons 3:1.

## 5. Depth and materials
- Light mode: at most three elevations: card (hairline or none), popover and menu (soft shadow), dialog (largest).
- Translucency and blur only on the navigation layer: a sticky header or toolbar (`bg-background/80 backdrop-blur`) with a hairline that appears once content scrolls under it. Never glass on cards or in content.
- Radius is consistent: one radius per component size from the tokens; nested corners are smaller than their container.

## 6. Motion
- Motion explains a change: where something came from, what changed, what is now selected. Brief, precise, interruptible; nobody waits for an animation. No motion on very frequent actions.
- Animate opacity and transform only. Lists animate insertions, removals and reordering; buttons show a press (scale about 0.97); popovers, sheets and toasts enter and exit.
- Springs (the Motion library, `components/motion.ts` in the web preset): state changes `visualDuration 0.35, bounce 0` (Apple's smooth); small feedback `0.25, bounce 0.15` (snappy); sheets and pages `0.45, bounce 0`. Never bounce a modal or a page. Color and opacity alone: 150 to 200 ms ease-out.
- Route changes that keep an object on screen (list to detail) may use View Transitions with a unique `view-transition-name`.
- Reduced motion: replace movement with fades, stop auto-playing and looping animation (`prefers-reduced-motion`; Motion's `<MotionConfig reducedMotion="user">`).
- Respond within 100 ms; anything over 400 ms shows progress.

## 7. Components and patterns
- **Buttons.** Hierarchy by style, not size: primary (filled accent), secondary (tinted or outline), tertiary (ghost or link). Buttons in one group have one size. Labels start with a verb and name the result ("Add book", not "Submit"). The primary action answers Enter. A destructive action is never the default; it is red and says what it destroys ("Delete shelf"). A slow action shows its spinner inside the button and disables it.
- **Lists over cards.** Text content goes in lists or tables, not a card per item. No cards inside cards. A selected row in navigation stays highlighted.
- **Navigation.** At most 5 top-level destinations on a phone; never hide or disable one (explain when it is empty); badges only for something that needs attention; the current place is always visible.
- **Sheets and dialogs.** Only when a task needs focus; short; one at a time; an obvious way out (Cancel leading, the action trailing). Confirm before discarding edits. Bottom sheet on phones, centered dialog on desktop.
- **Search.** If search matters, it has a primary, visible place, says its scope in the placeholder ("Search books"), shows recent searches, and debounces about 200 ms.
- **Forms.** Visible labels above fields (a placeholder is never the label). Right `type`, `inputmode` and `autocomplete`; allow paste. Do not ask for what can be inferred; prefill sensible defaults; pick from a list over typing. Validate on blur, re-check on each keystroke once a field shows an error, show the error under its field in plain words with the fix, and keep submit-time validation.
- **Loading.** Under about 1 s show nothing; delay any indicator about 300 ms so it never flashes. Known layout loading (a page, a section): a skeleton in that layout. An action: a spinner in its control. Over 10 s: progress with a count or percentage. People can keep working while things load.
- **Empty states.** Say what goes here and offer the one action that fills it (a button). Never put information there that is needed later.
- **Errors.** Next to what caused them; say what happened and how to fix it; no blame, no "Oops", no "we".
- **Feedback.** Prefer inline status next to the item. Toasts for non-blocking confirmations: at least 5 s, pause on hover, announced politely (`aria-live`), and anything they offer (Undo) is also reachable elsewhere. Alerts only for critical, actionable news.
- **Destructive actions.** Reversible (archive, remove from a list): act at once and offer Undo; no confirmation. Irreversible: a confirmation that names the object and a red button with the verb.
- **Onboarding.** Teach in context, where the feature is; any intro is short and skippable and never shown twice.
- **Accounts.** Whoever can create an account can delete it, from a findable place.

## 8. Writing
- Sentence case for headings, labels and buttons, everywhere.
- Buttons and links start with a verb and say what happens; never "Click here".
- Most important words first; cut every word that is not needed; plain language, no jargon.
- Multi-step flows: Continue or Next throughout, Done at the end.
- Use the person's words for their things ("Your shelves" sparingly), and "Unable to load books", not "We're having trouble".

## 9. Accessibility
- Touch targets 44 x 44 px at phone width and on touch screens (WCAG 2.5.8's 24 px is the floor everywhere). A checkbox or radio counts its whole label row.
- A visible focus ring on everything focusable (`focus-visible`, 3:1), never hidden under a sticky header (`scroll-padding-top`). Dialogs trap focus and return it on close.
- Icon-only buttons have an accessible name and a tooltip on desktop. Inputs have programmatic labels. Async results are announced.
- Never block zoom; reflow at 320 px wide.

## 10. Smells: what generated UI looks like
Flag and fix these on sight:
- the untouched component-library theme: pure grays, a black primary button, no brand accent;
- purple-to-pink gradients, glowing borders, glass on content cards;
- everything in bordered cards, cards inside cards;
- a narrow centered column on a 1440 px screen for an app; no sidebar, grid or split view where the content wants one;
- marketing patterns inside an app: a giant hero, emoji headings, "AI-powered" badges, three-icon feature grids, stat tiles with filler numbers;
- many primary buttons in one view, mixed button sizes in one group, unlabeled icon buttons;
- flat hierarchy: the same small muted text everywhere, or five-plus sizes and weights;
- proportional numbers in tables, left-aligned numeric columns;
- missing states: no empty, loading or error state, no focus ring, no pressed state, a spinner for a whole page;
- motion on everything: fade-up on scroll, bouncy dialogs, no reduced-motion handling;
- dark mode by inversion: pure black, pure white text, shadows for elevation, muted text below contrast;
- generic copy: "Submit", "Click here", "Oops! Something went wrong", Title Case Mixed With sentence case;
- an "Are you sure?" for something reversible, or one that does not name the object.

## 11. Rubric (the designer scores every screen 1 to 5)
| Criterion | 3 looks like | 5 looks like |
|---|---|---|
| Hierarchy | headings readable, but several things compete; more than one primary action | one obvious primary action; the eye goes title, key content, action; secondary information is visibly quieter |
| Layout and spacing | mostly aligned; spacing varies; groups blur together | everything on the 4/8 grid; groups clearly separated; the width is used well at desktop and nothing is cramped at phone width |
| Typography | readable, but too many sizes or weights, loose large headings | three or four named styles; tight display headings; tabular numbers; comfortable prose width |
| Color and theming | works in both themes but grays are raw, accent is on non-interactive things, dark looks inverted | semantic tokens; one accent for interaction; dark mode with lighter raised surfaces; contrast passes |
| States | happy path only | hover, focus, pressed, disabled, loading, selected all visible; empty, loading and error states with a next step; destructive actions follow the pattern |
| Copy | generic labels, mixed case | verb-first, specific, consistent sentence case, helpful errors |
| Accessibility | small targets or faint text in places | 44 px targets on phones, visible focus, labeled icon buttons, nothing said by color alone |
| Craft | competent but template-like; any smell from section 10 | purposeful depth on navigation only, restrained motion, nothing decorative without a job: it feels like a product someone designed |
