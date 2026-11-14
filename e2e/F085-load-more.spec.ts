import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { IMPORT_HEADER, importFile, openLibrary } from "./imports";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// 45 books through CSV import: 5 Want to read, 30 Reading, 10 Finished. Titles "Book 01 <s>" to "Book 45 <s>".
async function seed45(page: Page, s: string) {
  const rows = [IMPORT_HEADER];
  for (let i = 1; i <= 45; i++) {
    const title = `Book ${String(i).padStart(2, "0")} ${s}`;
    if (i <= 5) rows.push(`${title},Ann Author,want_to_read,,,,`);
    else if (i <= 35) rows.push(`${title},Ann Author,reading,,300,${daysAgo(3)},`);
    else rows.push(`${title},Ann Author,finished,4,300,${daysAgo(20)},${daysAgo(10)}`);
  }
  await openLibrary(page);
  await importFile(page, rows.join("\n") + "\n");
  await page.getByRole("button", { name: "Add 45 books" }).click();
  await expect(page.getByText(/Added 45 books/)).toBeVisible();
}

const bookLinks = (page: Page, s: string) => page.getByRole("link", { name: new RegExp(`Book \\d+ ${s}`) });
const params = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

// F085: the list pages 20 at a time. Fresh account and books per test (golden principle 7).
test("Load more shows 20, 40, then 45 books and the button goes away", async ({ page }) => {
  test.slow(); // 45 books imported first
  const s = stamp();
  await signUpAs(page, `f085-a-${s}@example.com`);
  await seed45(page, s);

  await page.goto("/books?sort=title");
  const more = page.getByRole("link", { name: "Load more" });
  await expect(bookLinks(page, s)).toHaveCount(20);
  await expect(more).toBeVisible();
  await more.click();
  await expect(bookLinks(page, s)).toHaveCount(40);
  await expect(more).toBeVisible();
  await more.click();
  await expect(bookLinks(page, s)).toHaveCount(45);
  await expect(more).toHaveCount(0);

  await expect(page.getByRole("link", { name: `Book 45 ${s}` })).toBeVisible();
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F085-all-loaded.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByRole("list")],
  });
});

test("paging keeps tab, search, sort and the tab counts", async ({ page }) => {
  test.slow();
  const s = stamp();
  await signUpAs(page, `f085-b-${s}@example.com`);
  await seed45(page, s);

  const tabs = page.getByRole("navigation", { name: "Book filter" });
  const counts = async () => {
    await expect(tabs.getByRole("link", { name: "All (45)", exact: true })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Want to read (5)", exact: true })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Reading (30)", exact: true })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Finished (10)", exact: true })).toBeVisible();
  };

  await page.goto("/books");
  await tabs.getByRole("link", { name: "Reading (30)" }).click();
  await expect(page).toHaveURL(/status=reading/);
  await page.getByLabel("Sort").click();
  await page.getByRole("option", { name: "Title A to Z" }).click();
  await expect.poll(() => params(page)).toMatchObject({ status: "reading", sort: "title" });
  await expect(bookLinks(page, s)).toHaveCount(20);
  await counts();

  await page.getByRole("link", { name: "Load more" }).click();
  await expect(bookLinks(page, s)).toHaveCount(30);
  expect(params(page)).toMatchObject({ status: "reading", sort: "title" });
  await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: `Book 06 ${s}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `Book 40 ${s}` })).toHaveCount(0);
  await counts();

  // Search over all 45, sorted by title: first 20 then 40; counts follow the search only.
  await page.goto(`/books?q=${encodeURIComponent(s)}&sort=title`);
  await expect(bookLinks(page, s)).toHaveCount(20);
  await page.getByRole("link", { name: "Load more" }).click();
  await expect(bookLinks(page, s)).toHaveCount(40);
  expect(params(page)).toMatchObject({ q: s, sort: "title" });
  await counts();
});

test("a book added while paged in shows once", async ({ page }) => {
  test.slow();
  const s = stamp();
  await signUpAs(page, `f085-c-${s}@example.com`);
  await seed45(page, s);

  await page.goto("/books?sort=title");
  await page.getByRole("link", { name: "Load more" }).click();
  await expect(bookLinks(page, s)).toHaveCount(40);

  // Add a book that sorts first, then page in again.
  const added = `Book 00 ${s}`;
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(added);
  await page.getByLabel("Author").fill("Ann Author");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/books?sort=title&limit=40");
  await expect(page.getByRole("link", { name: added })).toHaveCount(1);
  await expect(bookLinks(page, s)).toHaveCount(40);
  const more = page.getByRole("link", { name: "Load more" });
  await more.click();
  await expect(bookLinks(page, s)).toHaveCount(46);
  await expect(page.getByRole("link", { name: added })).toHaveCount(1);
  await expect(more).toHaveCount(0);
});
