import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F053: the book page shows when I started and finished it and how many days I read it.
// Each test uses a fresh account and its own book (golden principle 7).
const today = new Date().toISOString().slice(0, 10);
const todayLong = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });

async function openNewBook(page: Page, email: string, title: string, status = "Want to read") {
  await signUpAs(page, email);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Jane Austen");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: status, exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function moveTo(page: Page, status: string) {
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: status, exact: true }).click();
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
}

test("Reading then Finished shows both dates and 'Read in 1 day'", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openNewBook(page, `f053-${tag}@example.com`, `Persuasion ${tag}`);
  await moveTo(page, "Reading");
  await moveTo(page, "Finished");

  await expect(page.getByText(`Started on ${todayLong}`)).toBeVisible();
  await expect(page.getByText(`Finished on ${todayLong}`)).toBeVisible();
  await expect(page.getByText("Read in 1 day", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Read in 1 day", { exact: true })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F053-read-in-days.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Started on/), page.getByText(/Finished on/), page.getByRole("heading")],
  });
});

test("a finished book with no start date shows only Finished", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openNewBook(page, `f053b-${tag}@example.com`, `Emma ${tag}`, "Finished");

  await expect(page.getByText(`Finished on ${todayLong}`)).toBeVisible();
  await expect(page.getByText(/Started/)).toHaveCount(0);
  await expect(page.getByText(/Read in/)).toHaveCount(0);
  await expectAccessible(page);
});

test("a Reading book shows only Started", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openNewBook(page, `f053c-${tag}@example.com`, `Northanger ${tag}`);
  await moveTo(page, "Reading");

  await expect(page.getByText(`Started on ${todayLong}`)).toBeVisible();
  await expect(page.getByText(/Finished on/)).toHaveCount(0);
  await expect(page.getByText(/Read in/)).toHaveCount(0);
  await expectAccessible(page);
});
