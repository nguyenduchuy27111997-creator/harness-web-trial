import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";

// A fresh account with one Reading book, open on its page.
async function createFinishableBook(page: Page, tag: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Rated Book");
  await page.getByLabel("Author").fill("Rated Author");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Reading" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.getByRole("link", { name: "Rated Book" }).click();
}

// F011: rate a finished book 1 to 5 stars; the control exists only while Finished.
// Each run uses a fresh account (golden principle 7).
test("rate a finished book", async ({ page }) => {
  await createFinishableBook(page, `f011-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`);

  const group = page.getByRole("radiogroup", { name: "Rating" });
  await expect(group).toHaveCount(0);

  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Finished" }).click();
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio", { checked: true })).toHaveCount(0);

  const rate = async (stars: number) => {
    await group.getByRole("radio", { name: stars === 1 ? "1 star" : `${stars} stars` }).click();
    await page.getByRole("button", { name: "Rate" }).click();
    await expect(page.locator("form").filter({ has: group }).getByRole("status")).toHaveText("Saved");
    await page.reload();
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(group.getByRole("radio", { name: `${stars} star${stars === 1 ? "" : "s"}`, checked: true })).toBeVisible();
  };

  await rate(4);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F011-rated.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Finished on/)],
  });
  await rate(2);
});
