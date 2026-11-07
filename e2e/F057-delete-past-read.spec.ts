import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F057: delete a past read after confirming. Each test uses a fresh account and its own book.
const choose = async (page: Page, name: string, option: string) => {
  await page.getByRole("combobox", { name }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

// New Reading book, then `ratings.length` rounds of finish, rate, read again.
async function bookWithReads(page: Page, title: string, ratings: number[]) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("George Eliot");
  await choose(page, "Status", "Reading");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: title }).click();
  for (const n of ratings) {
    await choose(page, "Status", "Finished");
    await page.getByRole("button", { name: "Save status" }).click();
    await page.getByRole("radio", { name: `${n} stars` }).click();
    await page.getByRole("button", { name: "Rate" }).click();
    await page.getByRole("button", { name: "Read again" }).click();
    await expect(page.getByRole("combobox", { name: "Status" })).toContainText("Reading");
  }
}

// The "Past reads" block; the design doc gives the heading, not the container.
const pastReads = (page: Page) => page.getByRole("heading", { name: "Past reads" }).locator("xpath=..");
const hasStars = (scope: Locator, n: number) => scope.getByText(`${n} stars`).or(scope.getByLabel(`${n} stars`)).first();

test("delete a past read after confirming; Cancel keeps both", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const title = `Daniel Deronda ${tag}`;
  await signUpAs(page, `f057a-${tag}@example.com`);
  await bookWithReads(page, title, [4, 5]);
  await page.reload();

  const items = pastReads(page).getByRole("listitem");
  await expect(items).toHaveCount(2);
  // Newest first: the 5-star read, then the 4-star read.
  await expect(hasStars(items.nth(0), 5)).toBeVisible();
  await expect(hasStars(items.nth(1), 4)).toBeVisible();

  const dialog = page.getByRole("alertdialog");
  await items.nth(1).getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Delete this read?" })).toBeVisible();
  await expect(dialog.getByText("This past read will be deleted. This cannot be undone.")).toBeVisible();
  await expectAccessible(page);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(items).toHaveCount(2);
  await page.reload();
  await expect(items).toHaveCount(2);

  await items.nth(1).getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toHaveCount(0);

  const check = async () => {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(items).toHaveCount(1);
    await expect(hasStars(items.nth(0), 5)).toBeVisible();
    await expect(pastReads(page).getByText("4 stars")).toHaveCount(0);
    // The book itself is unchanged: still being read.
    await expect(page.getByRole("combobox", { name: "Status" })).toContainText("Reading");
  };
  await check();
  await page.reload();
  await check();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F057-past-read-deleted.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Started on/), page.getByText(/Finished on/), page.getByRole("heading", { level: 1 })],
  });
});

test("the Past reads section is not shown without past reads", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const title = `Silas Marner ${tag}`;
  await signUpAs(page, `f057b-${tag}@example.com`);
  await bookWithReads(page, title, []);
  await expect(page.getByRole("heading", { name: "Past reads" })).toHaveCount(0);

  // After deleting the only past read, the section goes away.
  await bookWithReads(page, `${title} again`, [3]);
  await expect(page.getByRole("heading", { name: "Past reads" })).toBeVisible();
  await pastReads(page).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Past reads" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Past reads" })).toHaveCount(0);
});
