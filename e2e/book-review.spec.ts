import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";

// A fresh account with one Want to read book (the add form's default), open on its page.
async function openNewBook(page: Page, email: string) {
  await page.goto("/sign-up");
  for (const [label, value] of [["Email", email], ["Password", "secret123"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.goto("/books/new");
  for (const [label, value] of [["Title", "Reviewed Book"], ["Author", "Reviewed Author"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Reviewed Book" }).click();
}

// F012: write a review of a finished book; too long is refused; no field unless Finished.
// Each run uses a fresh account (golden principle 7).
test("review a finished book", async ({ page }) => {
  await openNewBook(page, `f012-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);

  const review = page.getByRole("textbox", { name: "Review" });
  await expect(page.getByText("Want to read").first()).toBeVisible();
  await expect(review).toHaveCount(0);

  // Finishing the book brings up the review field.
  const statusField = page.getByRole("combobox", { name: "Status" });
  await statusField.click();
  await page.getByRole("option", { name: "Finished" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(review).toBeVisible();

  await review.fill("Loved the ending.");
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.locator("form").filter({ has: review }).getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(review).toHaveValue("Loved the ending.");

  await review.fill("a".repeat(2001));
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.locator("form").filter({ has: review }).getByRole("alert")).toHaveText("Review must be at most 2,000 characters");
  await expectAccessible(page);
  await page.reload();
  await expect(review).toHaveValue("Loved the ending.");

  await expect(page).toHaveScreenshot("F012-reviewed.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Finished on/)],
  });
});
