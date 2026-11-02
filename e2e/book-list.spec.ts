import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F007: the shelf lists books newest first, each with a serif title, the author and a status badge.
// Each run uses a fresh account (golden principle 7).
test("book list newest first with status badges", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f007-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  const books = [
    { title: "First Book", author: "Author One", status: "Want to read" },
    { title: "Second Book", author: "Author Two", status: "Reading" },
    { title: "Third Book", author: "Author Three", status: "Finished" },
  ];
  for (const book of books) {
    await page.goto("/books/new");
    await page.getByLabel("Title").fill(book.title);
    await page.getByLabel("Author").fill(book.author);
    if (book.status !== "Want to read") {
      await page.getByLabel("Status").click();
      await page.getByRole("option", { name: book.status }).click();
    }
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/books$/);
    await expect(page.getByRole("listitem").filter({ hasText: book.title })).toBeVisible();
  }

  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  for (const [i, book] of [...books].reverse().entries()) {
    const row = rows.nth(i);
    await expect(row.getByText(book.title, { exact: true })).toBeVisible();
    await expect(row.getByText(book.author, { exact: true })).toBeVisible();
    await expect(row.getByText(book.status, { exact: true })).toBeVisible();
    const fontFamily = await row.getByText(book.title, { exact: true }).evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily).toMatch(/Lora/i);
  }
  await expectAccessible(page);

  await page.setViewportSize({ width: 390, height: 844 });
  const lefts = await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  expect(new Set(lefts).size).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F007-books-phone.png");
});
