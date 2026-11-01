import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F004: a new account sees an empty shelf with a way to add a book. Each run uses a fresh email (golden principle 7).
test("empty shelf on /books", async ({ page }) => {
  const email = `f004-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  await expect(page.getByText("Your shelf is empty. Add your first book to get started.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add book" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F004-empty-shelf.png");

  await page.getByRole("link", { name: "Add book" }).click();
  await expect(page).toHaveURL(/\/books\/new$/);
});
