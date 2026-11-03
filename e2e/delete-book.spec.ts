import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F014: delete a book after confirming in a dialog; Cancel keeps it.
// Each run uses a fresh account (golden principle 7).
test("delete a book after confirming", async ({ page }) => {
  const tag = `f014-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
  for (const title of ["Kept Book", "Doomed Book"]) {
    await page.goto("/books/new");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Author").fill("Some Author");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/books$/);
  }

  await page.getByRole("link", { name: "Doomed Book" }).click();
  await expect(page.getByRole("heading", { name: "Doomed Book" })).toBeVisible();
  const bookUrl = page.url();

  const dialog = page.getByRole("alertdialog");
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Delete this book?" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F014-confirm.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(bookUrl);
  await expect(page.getByRole("heading", { name: "Doomed Book" })).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("link", { name: "Doomed Book" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kept Book" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Doomed Book" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kept Book" })).toBeVisible();
});
