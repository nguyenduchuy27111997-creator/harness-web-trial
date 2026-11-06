import type { Page } from "@playwright/test";

// Adds a book and opens its page.
export async function openNewBookPage(page: Page, title: string, author: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill(author);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: title }).click();
}
