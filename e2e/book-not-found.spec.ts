import { expect, test } from "@playwright/test";
import { signUpAs } from "./accounts";
import { expectAccessible } from "./a11y";

// F016: another account's book and an unknown id both answer a 404 "Book not found" page.
// Two fresh accounts per run (golden principle 7).
test("missing or foreign books show Book not found with status 404", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

  await signUpAs(page, `f016-a-${tag}@example.com`);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Private Book");
  await page.getByLabel("Author").fill("Author A");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.getByRole("link", { name: "Private Book" }).click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
  const bookUrl = page.url();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signUpAs(page, `f016-b-${tag}@example.com`);

  const foreign = await page.goto(bookUrl);
  expect(foreign?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Book not found" })).toBeVisible();
  await expect(page.getByText("Private Book")).toHaveCount(0);
  await expectAccessible(page);

  const missing = await page.goto("/books/00000000-0000-0000-0000-000000000000");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Book not found" })).toBeVisible();
  await expect(page).toHaveScreenshot("F016-book-not-found.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await page.getByRole("link", { name: "Back to my books" }).click();
  await expect(page).toHaveURL(/\/books$/);
});
