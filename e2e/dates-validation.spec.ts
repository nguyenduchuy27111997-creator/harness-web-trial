import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F055: date validation when editing a book's dates. Each test has its own account and book.
const long = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });
const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const BEFORE_START = "The finish date cannot be before the start date";
const FUTURE = "The date cannot be in the future";

async function openFinishedBook(page: Page, email: string, title: string) {
  await signUpAs(page, email);
  await page.goto("/books/new");
  const fields: Record<string, string> = { Title: title, Author: "Jane Austen" };
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label).fill(value);
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: /^Finished$/ }).click();
  await page.getByRole("button", { name: /^Save$/ }).click();
  await page.waitForURL(/\/books$/);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function saveDates(page: Page, started: string, finished: string) {
  await page.getByRole("button", { name: "Edit dates" }).click();
  for (const [label, value] of [["Started", started], ["Finished", finished]]) {
    await page.getByLabel(label).fill(value);
  }
  await page.getByRole("button", { name: /^Save$/ }).click();
}

test("a start date after the finish date shows an error and saves nothing", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openFinishedBook(page, `f055a-${tag}@example.com`, `Persuasion ${tag}`);

  await saveDates(page, "2026-10-12", "2026-10-01");
  await expect(page.getByText(BEFORE_START)).toBeVisible();
  await expect(page.getByLabel("Finished")).toBeVisible();
  await expectAccessible(page);

  await page.reload();
  await expect(page.getByText(/Started on/)).toHaveCount(0);
  await expect(page.getByText(/Read in/)).toHaveCount(0);
});

test("a finish date in the future shows an error and saves nothing", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openFinishedBook(page, `f055b-${tag}@example.com`, `Emma ${tag}`);

  await page.getByRole("button", { name: "Edit dates" }).click();
  await page.getByLabel("Finished").fill(tomorrowIso);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(FUTURE)).toBeVisible();

  await page.reload();
  await expect(page.getByText(long(tomorrowIso))).toHaveCount(0);
});

test("clearing Started removes the start date and 'Read in'", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openFinishedBook(page, `f055c-${tag}@example.com`, `Mansfield ${tag}`);

  await saveDates(page, "2026-10-01", "2026-10-12");
  await expect(page.getByText("Read in 12 days", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit dates" }).click();
  await page.getByLabel("Started").fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(`Finished on ${long("2026-10-12")}`)).toBeVisible();
  await expect(page.getByText(/Started on/)).toHaveCount(0);
  await expect(page.getByText(/Read in/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(`Finished on ${long("2026-10-12")}`)).toBeVisible();
  await expect(page.getByText(/Read in/)).toHaveCount(0);
});

test("fixing the dates clears the errors and shows the new dates", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openFinishedBook(page, `f055d-${tag}@example.com`, `Northanger ${tag}`);

  await saveDates(page, "2026-10-12", "2026-10-01");
  await expect(page.getByText(BEFORE_START)).toBeVisible();

  await page.getByLabel("Started").fill("2026-10-01");
  await page.getByLabel("Finished").fill("2026-10-12");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(BEFORE_START)).toHaveCount(0);
  await expect(page.getByText(FUTURE)).toHaveCount(0);
  await expect(page.getByText(`Started on ${long("2026-10-01")}`)).toBeVisible();
  await expect(page.getByText(`Finished on ${long("2026-10-12")}`)).toBeVisible();
  await expect(page.getByText("Read in 12 days", { exact: true })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F055-dates-fixed.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByRole("heading")],
  });
});
