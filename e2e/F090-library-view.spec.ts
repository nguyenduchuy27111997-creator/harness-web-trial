import { expect, test, type Page } from "@playwright/test";
import { expectScreens } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// Three books, one per status. The account is new, so the titles need no unique suffix.
async function shelf(page: Page, email: string) {
  await signUpAs(page, email);
  await addAndOpenBook(page, "Alpha", "Want to read");
  await addAndOpenBook(page, "Beta", "Reading");
  await addAndOpenBook(page, "Gamma", "Finished");
  // Sorted by title so the order does not depend on when each book was added.
  await page.goto("/books?sort=title");
}

const item = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });

// Acceptance 1, first half: a grid of covers on a computer.
test("on a computer my books are a grid of covers with title and author under each", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await shelf(page, `f090-a-${stamp()}@example.com`);
  const [a, b, c] = ["Alpha", "Beta", "Gamma"].map((t) => item(page, t));
  for (const it of [a, b, c]) {
    await expect(it).toBeVisible();
    await expect(it.getByText("George Eliot")).toBeVisible();
  }
  const [boxA, boxB, boxC] = await Promise.all([a, b, c].map((it) => it.boundingBox()));
  // Side by side on one row, in order of title (sorted A to Z).
  expect(Math.abs(boxB!.y - boxA!.y)).toBeLessThan(20);
  expect(Math.abs(boxC!.y - boxA!.y)).toBeLessThan(20);
  expect(boxB!.x).toBeGreaterThan(boxA!.x + 100);
  expect(boxC!.x).toBeGreaterThan(boxB!.x + 100);
  // A cover is taller than wide, with the title under it.
  expect(boxA!.height).toBeGreaterThan(boxA!.width);
  const title = a.getByText("Alpha", { exact: true });
  await expect(title).toBeVisible();
  expect((await title.boundingBox())!.y).toBeGreaterThan(boxA!.y + boxA!.width);

  await page.mouse.move(0, 0);
  await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  await expectScreens(page, "F090-library-grid");
});

// Acceptance 1, second half: rows on a phone.
test("on a phone my books are rows with a cover, title, author and status", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await shelf(page, `f090-b-${stamp()}@example.com`);
  const [a, b] = ["Alpha", "Beta"].map((t) => item(page, t));
  for (const [it, status] of [[a, "Want to read"], [b, "Reading"], [item(page, "Gamma"), "Finished"]] as const) {
    await expect(it).toBeVisible();
    await expect(it.getByText("George Eliot")).toBeVisible();
    await expect(it.getByText(status, { exact: true })).toBeVisible();
  }
  const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  // Stacked: one under the other, in order of title, each at least a finger tall.
  expect(Math.abs(boxB!.x - boxA!.x)).toBeLessThan(20);
  expect(boxB!.y).toBeGreaterThan(boxA!.y + 40);
  expect(boxA!.height).toBeGreaterThanOrEqual(44);

  await page.mouse.move(0, 0);
  await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  await expectScreens(page, "F090-library-rows");
});

// Acceptance 2: segmented status filter with counts, search on top, sort as a menu.
test("the status filter shows counts, search says Search books and sort is a menu", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await shelf(page, `f090-c-${stamp()}@example.com`);

  const tabs = page.getByRole("navigation", { name: "Book filter" });
  for (const name of ["All (3)", "Want to read (1)", "Reading (1)", "Finished (1)"]) {
    await expect(tabs.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(tabs.getByRole("link", { name: "All (3)" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Reading (1)" }).click();
  await expect(page).toHaveURL(/status=reading/);
  await expect(tabs.getByRole("link", { name: "Reading (1)" })).toHaveAttribute("aria-current", "page");
  await expect(item(page, "Beta")).toBeVisible();
  await expect(item(page, "Alpha")).toHaveCount(0);

  // Search sits above the filter and the list.
  const search = page.getByPlaceholder("Search books");
  await expect(search).toBeVisible();
  const [s, t, l] = await Promise.all([search, tabs, item(page, "Beta")].map((x) => x.boundingBox()));
  expect(s!.y).toBeLessThan(t!.y);
  expect(s!.y).toBeLessThan(l!.y);
  await search.fill("Beta");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=Beta/);
  await expect(item(page, "Beta")).toBeVisible();

  // Sort is a menu that opens on click and lists the choices.
  await page.goto("/books");
  const sort = page.getByLabel("Sort");
  await sort.click();
  await expect(page.getByRole("option", { name: "Title A to Z" })).toBeVisible();
  await page.getByRole("option", { name: "Title A to Z" }).click();
  await expect(page).toHaveURL(/sort=title/);
  await expect(sort).toHaveText("Title A to Z");
  await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expectScreens(page, "F090-library-controls");
});

// Acceptance 3: the empty shelf says what to do next. (The loading placeholders show only on a slow load and are
// not something a test can hold still, so they are not checked here.)
test("an empty shelf says what to do next with an Add book button", async ({ page }) => {
  await signUpAs(page, `f090-d-${stamp()}@example.com`);
  await expect(page.getByRole("heading", { name: "No books yet" })).toBeVisible();
  await expect(page.getByText("Your shelf is empty. Add your first book to get started.")).toBeVisible();
  const add = page.getByRole("link", { name: "Add book" }).or(page.getByRole("button", { name: "Add book" }));
  await expect(add).toHaveCount(1);
  await expect(page.getByPlaceholder("Search books")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Book filter" })).toHaveCount(0);
  await expect(page.getByLabel("Sort")).toHaveCount(0);

  await page.mouse.move(0, 0);
  await expectScreens(page, "F090-empty-shelf");

  await add.click();
  await expect(page).toHaveURL(/\/books\/new$|\/books\?add=1$/);
});
