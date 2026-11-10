import type { Page } from "@playwright/test";

export async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

// Adds a book and opens its page; callers check the heading.
export async function addAndOpenBook(page: Page, title: string, status: string) {
  await page.goto("/books/new");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByLabel("Title").fill(title);
  await pick(page, "Status", status);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: title }).click();
}

// Picks a status and saves it; callers check the "Saved" status.
export async function saveStatus(page: Page, name: string) {
  await pick(page, "Status", name);
  await page.getByRole("button", { name: "Save status" }).click();
}

// Adds a Want to read book and puts it last in the Up next queue.
export async function addQueuedBook(page: Page, title: string) {
  await addAndOpenBook(page, title, "Want to read");
  await page.getByRole("button", { name: "Add to Up next" }).click();
  await page.getByText("In Up next").waitFor();
}
