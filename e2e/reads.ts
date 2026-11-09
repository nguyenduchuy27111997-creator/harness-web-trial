import { expect, type Page } from "@playwright/test";

async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

// Adds a book with a status and opens its page.
export async function addBookWithStatus(page: Page, title: string, status: string) {
  await page.goto("/books/new");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByLabel("Title").fill(title);
  await pick(page, "Status", status);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

// Sets the status to Finished, then rates the book.
export async function finishAndRateBook(page: Page, stars: number) {
  await pick(page, "Status", "Finished");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved");
  const group = page.getByRole("radiogroup", { name: "Rating" });
  await group.getByRole("radio", { name: stars === 1 ? "1 star" : `${stars} stars` }).click();
  await page.getByRole("button", { name: "Rate" }).click();
  await expect(page.locator("form").filter({ has: group }).getByRole("status")).toHaveText("Saved");
}

// The "Past reads" block; the design doc gives the heading, not the container.
export const pastReadsBlock = (page: Page) => page.getByRole("heading", { name: "Past reads" }).locator("xpath=..");

// Opens "Edit dates" on a finished book's page and saves its finish date (YYYY-MM-DD).
export async function setFinishedOn(page: Page, iso: string) {
  await page.getByRole("button", { name: "Edit dates" }).click();
  await page.getByLabel("Finished").fill(iso);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit dates" })).toBeVisible();
}

// On a Reading book's page: saves its total pages (and page 1) under "Progress".
export async function setTotalPages(page: Page, total: string) {
  await page.getByLabel("Total pages").fill(total);
  await page.getByLabel("Current page").fill("1");
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText(`Page 1 of ${total}`)).toBeVisible();
}

// Sets the status to Finished and waits for "Saved".
export async function finishBook(page: Page) {
  await pick(page, "Status", "Finished");
  await page.getByRole("button", { name: "Save status" }).click();
  // Wait for the save to land: a Finished book has no Progress form (its own "Saved" would match first otherwise).
  await expect(page.getByRole("button", { name: "Save progress" })).toBeHidden();
  await expect(page.getByRole("status").first()).toHaveText("Saved");
}

// Opens "Edit dates" on a Reading or Finished book and saves both dates (YYYY-MM-DD), so the finish date is never before the start date.
export async function setReadDates(page: Page, startedOn: string, finishedOn: string) {
  await page.getByRole("button", { name: "Edit dates" }).click();
  await page.getByLabel("Started", { exact: true }).fill(startedOn);
  await page.getByLabel("Finished", { exact: true }).fill(finishedOn);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit dates" })).toBeVisible();
}
