import { expect, test, type Page } from "@playwright/test";
import { expectScreens } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook, addTagsOnBookPage } from "./books";
import { coverFile, submitCover } from "./covers";
import { saveQuoteOnBookPage } from "./notes";
import { createShelves, shelveOpenBook } from "./shelves";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// The large title: an h1 well above body size (the UI guide's large title is 34 px).
async function expectLargeTitle(page: Page, name: string) {
  const title = page.getByRole("heading", { name, level: 1, exact: true });
  await expect(title).toBeVisible();
  const size = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(28);
}

test("shelves are rows with up to three covers, the name and a book count", async ({ page }) => {
  test.slow();
  await signUpAs(page, `f093-shelves-${stamp()}@example.com`);
  const full = `Crowded ${stamp()}`;
  const single = `Single ${stamp()}`;
  await createShelves(page, [full, single]);

  const titles = [1, 2, 3, 4].map((n) => `Covered ${n} ${stamp()}`);
  for (const [i, title] of titles.entries()) {
    await addAndOpenBook(page, title, "Reading");
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await submitCover(page, coverFile("image/png"), "Add cover");
    await expect(page.getByRole("img", { name: `Cover of ${title}` })).toBeVisible();
    await shelveOpenBook(page, full);
    if (i === 0) await shelveOpenBook(page, single);
  }

  await page.goto("/shelves");
  await expectLargeTitle(page, "Shelves");
  const row = (name: string) => page.getByRole("listitem").filter({ hasText: name });
  await expect(row(full)).toContainText("4 books");
  await expect(row(full).getByRole("img")).toHaveCount(3);
  await expect(row(single)).toContainText("1 book");
  await expect(row(single).getByRole("img")).toHaveCount(1);

  await page.mouse.move(0, 0);
  await expectScreens(page, "F093-shelves-rows", { mask: [page.getByRole("listitem")] });
});

test("shelves empty state: one action to create a shelf", async ({ page }) => {
  await signUpAs(page, `f093-shelves-empty-${stamp()}@example.com`);
  await page.goto("/shelves");
  await expectLargeTitle(page, "Shelves");
  await expect(page.getByText("No shelves yet")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create shelf" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expectScreens(page, "F093-shelves-empty");
});

test("tags are rows with a count", async ({ page }) => {
  await signUpAs(page, `f093-tags-${stamp()}@example.com`);
  const first = `Emma ${stamp()}`;
  const second = `Persuasion ${stamp()}`;
  await addAndOpenBook(page, first, "Reading");
  await expect(page.getByRole("heading", { name: first })).toBeVisible();
  await addTagsOnBookPage(page, ["classic", "travel"]);
  await addAndOpenBook(page, second, "Reading");
  await expect(page.getByRole("heading", { name: second })).toBeVisible();
  await addTagsOnBookPage(page, ["classic"]);

  await page.goto("/tags");
  await expectLargeTitle(page, "Tags");
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("classic");
  await expect(rows.nth(0)).toContainText("2 books");
  await expect(rows.nth(1)).toContainText("travel");
  await expect(rows.nth(1)).toContainText("1 book");

  await page.mouse.move(0, 0);
  await expectScreens(page, "F093-tags-rows", { mask: [page.getByRole("listitem")] });
});

test("tags empty state: one action back to my books", async ({ page }) => {
  await signUpAs(page, `f093-tags-empty-${stamp()}@example.com`);
  await page.goto("/tags");
  await expectLargeTitle(page, "Tags");
  await expect(page.getByText("No tags yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to my books" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expectScreens(page, "F093-tags-empty");
});

test("quotes are a list with each quote in the serif and its book under it", async ({ page }) => {
  test.slow();
  await signUpAs(page, `f093-quotes-${stamp()}@example.com`);
  const title = `Middlemarch ${stamp()}`;
  const quote = `It is never too late ${stamp()}`;
  await addAndOpenBook(page, title, "Reading");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await saveQuoteOnBookPage(page, quote);

  await page.goto("/quotes");
  await expectLargeTitle(page, "Quotes");
  const item = page.getByRole("listitem").filter({ hasText: quote });
  await expect(item).toHaveCount(1);
  const text = item.getByText(quote);
  // The page's heading font is the serif (Lora) from the design system.
  expect(await text.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/lora|serif/i);
  const link = item.getByRole("link", { name: title });
  await expect(link).toBeVisible();
  const [quoteBox, linkBox] = [await text.boundingBox(), await link.boundingBox()];
  expect(linkBox!.y).toBeGreaterThan(quoteBox!.y + quoteBox!.height - 1);

  await page.mouse.move(0, 0);
  await expectScreens(page, "F093-quotes-list", { mask: [page.getByRole("listitem")] });
});

test("quotes empty state: one action back to my books", async ({ page }) => {
  await signUpAs(page, `f093-quotes-empty-${stamp()}@example.com`);
  await page.goto("/quotes");
  await expectLargeTitle(page, "Quotes");
  await expect(page.getByText("No quotes yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to my books" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expectScreens(page, "F093-quotes-empty");
});
