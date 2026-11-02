import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F005: add a book from /books/new. Each run uses a fresh account and book titles (golden principle 7).
test("add a book", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f005-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/books/new");
  await expect(page.getByLabel("Title")).toBeVisible();
  await expect(page.getByLabel("Author")).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveText("Want to read");
  await expectAccessible(page);

  await page.getByLabel("Title").fill("Middlemarch");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  const first = page.getByRole("listitem").filter({ hasText: "Middlemarch" });
  await expect(first).toContainText("George Eliot");
  await expect(first).toContainText("Want to read");
  await expect(page.getByText("Your shelf is empty")).toHaveCount(0);

  await page.getByRole("link", { name: "Add book" }).click();
  await page.getByLabel("Title").fill("Dune");
  await page.getByLabel("Author").fill("Frank Herbert");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Reading" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("listitem").filter({ hasText: "Dune" })).toContainText("Reading");
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F005-books-added.png");
});
