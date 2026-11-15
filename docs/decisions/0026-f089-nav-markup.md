# 0026: Navigation rows are plain links; the account button always names "account"

Status: accepted (F089)

Two small choices in building the M9 navigation (docs/design/M9.md, Navigation) that the design leaves open:

- **Sidebar, tab bar and More rows are links in a `nav`, not `ul`/`li`.** The sidebar is on every page from `lg`, and many specs count `page.getByRole("listitem")` for the book, shelf and tag lists. List markup there would add eight items to every count. `nav` with `aria-label="Main"` already names the group for assistive tech.
- **The account menu button's name always contains "account".** Shown text is the display name (or "Account" when there is none); with a name set, a visually hidden ", account" follows it, so the name is "Huy, account": it starts with the visible label (label in name) and still says what the button opens. `e2e/accounts.ts`' `signOut` finds the button by `/account|@/i` for any account.
