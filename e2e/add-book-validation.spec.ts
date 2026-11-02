import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F006: add-book validation errors show next to the field. Fresh account per run (golden principle 7).
test("add-book validation errors", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f006-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/books/new");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#title-error")).toHaveText("Title is required");
  await expect(page.locator("#author-error")).toHaveText("Author is required");
  await expect(page).toHaveURL(/\/books\/new$/);
  await expectAccessible(page);

  await page.getByLabel("Title").fill("t".repeat(201));
  await page.getByLabel("Author").fill("a".repeat(121));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#title-error")).toHaveText("Title must be at most 200 characters");
  await expect(page.locator("#author-error")).toHaveText("Author must be at most 120 characters");
  await expect(page).toHaveScreenshot("F006-validation-errors.png");

  const title = `Validated ${tag}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Jane Author");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("listitem").filter({ hasText: title })).toContainText("Jane Author");
});
