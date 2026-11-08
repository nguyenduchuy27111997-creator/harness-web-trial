import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F058: /stats counts every read finished this year, past reads included. Fresh account per test.
async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function addBook(page: Page, title: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("George Eliot");
  await pick(page, "Status", "Reading");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function finish(page: Page, stars: number) {
  await pick(page, "Status", "Finished");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved");
  const group = page.getByRole("radiogroup", { name: "Rating" });
  await group.getByRole("radio", { name: stars === 1 ? "1 star" : `${stars} stars` }).click();
  await page.getByRole("button", { name: "Rate" }).click();
  await expect(page.locator("form").filter({ has: group }).getByRole("status")).toHaveText("Saved");
}

test("a book finished and read again counts twice, with a goal, and deleting a past read counts once", async ({ page }) => {
  test.setTimeout(120_000); // long journey on a dev server
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const title = `Middlemarch ${tag}`;
  await signUpAs(page, `f058a-${tag}@example.com`);
  await addBook(page, title);
  await finish(page, 4);
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(page.getByRole("heading", { name: "Past reads" })).toBeVisible();
  await finish(page, 2);

  await page.goto("/stats");
  await expect(page.getByText("Books finished this year: 2")).toBeVisible();

  await page.getByLabel("Reading goal").fill("20");
  await page.getByRole("button", { name: "Set goal" }).click();
  await expect(page.getByText("2 of 20 books finished this year")).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 of 20 books finished this year")).toBeVisible();
  await expectAccessible(page);

  await page.goto("/books");
  await page.getByRole("link", { name: title }).click();
  const past = page.getByRole("heading", { name: "Past reads" }).locator("xpath=..");
  await past.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Past reads" })).toHaveCount(0);
  // Make sure the delete has been saved before looking at the stats.
  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Past reads" })).toHaveCount(0);

  await page.goto("/stats");
  await expect(page.getByText("Books finished this year: 1")).toBeVisible();
  await expect(page.getByText("1 of 20 books finished this year")).toBeVisible();
});

test("the average rating ignores past reads", async ({ page }) => {
  test.setTimeout(120_000); // long journey on a dev server
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f058b-${tag}@example.com`);
  // Current ratings 2 and 5 average 3.5; counting the past 4 would give 3.7.
  await addBook(page, `Middlemarch ${tag}`);
  await finish(page, 4);
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(page.getByRole("heading", { name: "Past reads" })).toBeVisible();
  await finish(page, 2);
  await addBook(page, `Persuasion ${tag}`);
  await finish(page, 5);

  await page.goto("/stats");
  await expect(page.getByText("Books finished this year: 3")).toBeVisible();
  await expect(page.getByText("Average rating: 3.5")).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F058-stats-count-reads.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
