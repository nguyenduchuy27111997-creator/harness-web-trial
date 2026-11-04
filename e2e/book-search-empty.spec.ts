import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F021: a search with no matches offers to clear it. Fresh account per run (golden principle 7).
test("a search with no matches offers a Clear search link", async ({ page }) => {
  await signUpAs(page, `f021-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Emma");
  await page.getByLabel("Author").fill("Jane Austen");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/books?q=zzzz");
  await expect(page.getByText(/No books match .zzzz./)).toBeVisible();
  await page.getByRole("link", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("listitem").filter({ hasText: "Emma" })).toBeVisible();

  await page.goto("/books?status=reading&q=zzzz");
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F021-no-matches.png");
  await page.getByRole("link", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/books\?status=reading$/);
  await expect(page.getByRole("navigation", { name: "Book filter" }).getByRole("link", { name: "Reading" })).toHaveAttribute("aria-current", "page");
});
