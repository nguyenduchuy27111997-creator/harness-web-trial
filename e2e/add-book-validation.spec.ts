import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F006: add-book validation errors show next to the field. Own account and titles per run (golden principle 7).
test("add-book validation errors next to the field", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f006-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/books/new");
  const title = page.getByLabel("Title");
  const author = page.getByLabel("Author");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(title).toHaveAccessibleDescription("Title is required");
  await expect(author).toHaveAccessibleDescription("Author is required");
  await expect(page).toHaveURL(/\/books\/new$/);

  await title.fill("x".repeat(201));
  await author.fill("y".repeat(121));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(title).toHaveAccessibleDescription("Title must be at most 200 characters");
  await expect(author).toHaveAccessibleDescription("Author must be at most 120 characters");
  await expect(page).toHaveURL(/\/books\/new$/);
  // Check the resting state, not Save's hover state under the pointer.
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F006-validation-errors.png");

  const bookTitle = `Valid book ${tag}`;
  await title.fill(bookTitle);
  await author.fill("Ursula K. Le Guin");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("listitem").filter({ hasText: bookTitle })).toContainText("Ursula K. Le Guin");
  // Neither invalid attempt added a book.
  await expect(page.getByRole("listitem")).toHaveCount(1);
});
