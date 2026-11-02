import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F009: a book's title on the shelf opens its page; "Back to my books" returns.
// Each run uses a fresh account (golden principle 7).
test("book page from the shelf and back", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f009-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Page Book");
  await page.getByLabel("Author").fill("Page Author");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Reading" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.getByRole("link", { name: "Page Book" }).click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Page Book" })).toBeVisible();
  await expect(page.locator("main", { has: page.getByRole("heading", { level: 1, name: "Page Book" }) }).getByText("Page Author", { exact: true })).toBeVisible();
  await expect(page.locator("main", { has: page.getByRole("heading", { level: 1, name: "Page Book" }) }).getByText("Reading", { exact: true })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F009-book-page.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await page.getByRole("link", { name: "Back to my books" }).click();
  await expect(page).toHaveURL(/\/books$/);
});
