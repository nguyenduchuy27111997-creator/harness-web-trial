// How the office's camera (harness/cam.mjs) sees this app: it signs in as the office's own test user (a user in the
// local Supabase only; the loop makes up its password), adds the sample data the pages need, and opens the page of
// the file the agent is editing. This file is the project's: change it when the sign-in form or the data changes.
// If it breaks, the office shows the app as a visitor; the loop and the tests never depend on it.

/** Sign in, or sign up the first time. True once the app is past its sign-in page. */
export async function signIn(page, { email, password }) {
  for (const [path, button] of [["/sign-in", /sign in|log in/i], ["/sign-up", /sign up|create account/i]]) {
    await page.goto(path, { timeout: 60_000 });
    const field = page.locator('input[type="email"], input[name="email"]').or(page.getByLabel(/email/i));
    if (!(await field.count())) continue;
    await field.first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.getByRole("button", { name: button }).first().click();
    await page.waitForURL(u => !u.pathname.startsWith(path), { timeout: 15_000 }).catch(() => {});
    if (!new URL(page.url()).pathname.startsWith(path)) return true;
  }
  return false;
}

/** Sample data, added once per loop through the app's own forms, so pages with an [id] have something to show.
 *  Bookshelf: three books, through "Add a book" (as e2e/add-book.spec.ts does); only the ones not on the shelf yet. */
const BOOKS = [["Middlemarch", "George Eliot"], ["Dune", "Frank Herbert"], ["The Left Hand of Darkness", "Ursula K. Le Guin"]];
export async function seed(page) {
  await page.goto("/books", { timeout: 60_000 });
  const shelf = await page.locator("main").innerText();
  for (const [title, author] of BOOKS.filter(([title]) => !shelf.includes(title))) {
    await page.goto("/books/new", { timeout: 60_000 });
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Author").fill(author);
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/books$/, { timeout: 60_000 });  // the first save compiles the action
  }
}

/** The page a file belongs to (App Router): app/(group)/books/[id]/page.tsx -> /books/[id]. Null keeps the page. */
export function routeOf(path) {
  const m = path.match(/^(?:src\/)?app\/(?:(.*)\/)?page\.(?:tsx|jsx|ts|js|mdx)$/);
  if (!m) return null;
  const parts = (m[1] ?? "").split("/").filter(s => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
  return "/" + parts.join("/");
}
