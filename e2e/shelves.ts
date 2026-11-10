import { expect, type Page } from "@playwright/test";

export async function createShelves(page: Page, names: string[]) {
  await page.goto("/shelves");
  for (const name of names) {
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Create shelf" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }
}

// Adds a book, opens its page and puts it on `shelf`.
export async function addBookOnShelf(page: Page, title: string, author: string, shelf: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill(author);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("combobox", { name: "Shelf" }).click();
  await page.getByRole("option", { name: shelf }).click();
  await page.getByRole("button", { name: "Add to shelf" }).click();
}

// Puts the book page that is open on `shelf`; callers check the heading first.
export async function shelveOpenBook(page: Page, shelf: string) {
  await page.getByRole("combobox", { name: "Shelf" }).click();
  await page.getByRole("option", { name: shelf }).click();
  await page.getByRole("button", { name: "Add to shelf" }).click();
  await expect(page.getByRole("list", { name: "Shelves this book is on" })).toContainText(shelf);
}
