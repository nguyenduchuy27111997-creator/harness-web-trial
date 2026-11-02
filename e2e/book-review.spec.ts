import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F012: write a short review of a finished book (own account, own data).
test("review a finished book", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f012-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Review Book");
  await page.getByLabel("Author").fill("Review Author");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.getByRole("link", { name: "Review Book" }).click();

  // Not finished: no review field.
  await expect(page.getByLabel("Review")).toHaveCount(0);

  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Finished" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");

  await page.getByLabel("Review").fill("Loved the ending.");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Review")).toHaveValue("Loved the ending.");

  // Too long: error next to the field, old review kept.
  await page.getByLabel("Review").fill("a".repeat(2001));
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByText("Review must be at most 2,000 characters")).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F012-review-error.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Finished on/), page.getByLabel("Review")],
  });
  await page.reload();
  await expect(page.getByLabel("Review")).toHaveValue("Loved the ending.");
});
