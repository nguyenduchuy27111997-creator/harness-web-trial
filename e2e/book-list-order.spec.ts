import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F007: the shelf lists books newest first, each with a status badge. Fresh account and titles per run (golden principle 7).
test("book list newest first with status badges", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f007-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  const books = [
    { title: "First Book", author: "Ann Author", status: null },
    { title: "Second Book", author: "Ben Writer", status: "Reading" },
    { title: "Third Book", author: "Cy Novelist", status: "Finished" },
  ];
  for (const book of books) {
    await page.goto("/books/new");
    await page.getByLabel("Title").fill(book.title);
    await page.getByLabel("Author").fill(book.author);
    if (book.status) {
      await page.getByLabel("Status").click();
      await page.getByRole("option", { name: book.status }).click();
    }
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/books$/);
    await expect(page.getByRole("listitem").filter({ hasText: book.title })).toBeVisible();
  }

  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Third Book");
  await expect(rows.nth(1)).toContainText("Second Book");
  await expect(rows.nth(2)).toContainText("First Book");

  const expected = [
    ["Third Book", "Cy Novelist", "Finished"],
    ["Second Book", "Ben Writer", "Reading"],
    ["First Book", "Ann Author", "Want to read"],
  ];
  for (const [i, [title, author, badge]] of expected.entries()) {
    const row = rows.nth(i);
    await expect(row).toContainText(author);
    await expect(row).toContainText(badge);
    const family = await row.getByText(title, { exact: true }).evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toMatch(/Lora/i);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  const boxes = await Promise.all([0, 1, 2].map((i) => rows.nth(i).boundingBox()));
  expect(new Set(boxes.map((b) => Math.round(b!.x))).size).toBe(1);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F007-books-list-mobile.png");
});
