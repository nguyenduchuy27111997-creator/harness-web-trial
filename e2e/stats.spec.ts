import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";

// Adds a book already Finished (the database stamps today's date), optionally rated.
async function addFinishedBook(page: Page, title: string, stars?: number) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Stats Author");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Finished" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  if (stars === undefined) return;
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("radiogroup", { name: "Rating" }).getByRole("radio", { name: `${stars} stars` }).click();
  await page.getByRole("button", { name: "Rate" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
}

// F015: yearly stats. Each run uses a fresh account (golden principle 7).
test("stats: finished this year and average rating", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f015-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.getByRole("link", { name: "Stats", exact: true }).click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByText("Books finished this year: 0")).toBeVisible();
  await expect(page.getByText("Average rating: No ratings yet")).toBeVisible();

  await addFinishedBook(page, "Stats One", 4);
  await addFinishedBook(page, "Stats Two", 5);
  await addFinishedBook(page, "Stats Three");

  await page.getByRole("link", { name: "Stats", exact: true }).click();
  await expect(page.getByText("Books finished this year: 3")).toBeVisible();
  await expect(page.getByText("Average rating: 4.5")).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F015-stats.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await page.getByRole("link", { name: "My books" }).click();
  await expect(page).toHaveURL(/\/books$/);
});
