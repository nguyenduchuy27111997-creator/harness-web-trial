import { expect, type Page } from "@playwright/test";

// Adds a book and opens its page.
export async function openNewBookPage(page: Page, title: string, author: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill(author);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: title }).click();
}

// Saves a quote on the book page that is open. The add form resets after a save, which can overwrite a
// fill made too early, so retry until the quote shows in the book's list.
export async function saveQuoteOnBookPage(page: Page, text: string) {
  const item = page.getByRole("list", { name: "Quotes from this book" }).getByRole("listitem").first();
  await expect(async () => {
    await page.getByRole("textbox", { name: "Quote", exact: true }).fill(text);
    await page.getByRole("button", { name: "Save quote" }).click();
    await expect(item).toContainText(text, { timeout: 3000 });
  }).toPass();
}
