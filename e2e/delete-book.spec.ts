import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F014: Delete on a book's page asks to confirm; Cancel keeps the book, confirming removes it.
// Each run uses a fresh account (golden principle 7).
test("delete a book after confirming", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f014-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Doomed Book");
  await page.getByLabel("Author").fill("Doomed Author");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.getByRole("link", { name: "Doomed Book" }).click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
  const bookUrl = page.url();

  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expectAccessible(page);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(bookUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Doomed Book" })).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByText("Your shelf is empty.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Doomed Book" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Your shelf is empty.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Doomed Book" })).toHaveCount(0);
  await expect(page).toHaveScreenshot("F014-book-deleted.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
