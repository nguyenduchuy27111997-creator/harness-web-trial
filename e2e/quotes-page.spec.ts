import { expect, test, type Page } from "@playwright/test";
import { signUpAs } from "./accounts";
import { expectAccessible } from "./a11y";

const MIDDLEMARCH = "It is a narrow mind which cannot look at a subject from various points of view.";
const PERSUASION = "She had been forced into prudence in her youth, she learned romance as she grew older.";

async function addBook(page: Page, title: string, author: string) {
  await page.goto("/books/new");
  for (const [label, value] of [["Title", title], ["Author", author]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
}

async function saveQuote(page: Page, title: string, quote: string, pageNumber?: string) {
  await page.goto("/books");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("textbox", { name: "Quote", exact: true }).fill(quote);
  if (pageNumber) await page.getByRole("textbox", { name: "Page (optional)" }).fill(pageNumber);
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByRole("list", { name: "Quotes from this book" })).toContainText(quote);
}

// F048: /quotes lists all my quotes newest first, each linking to its book.
// Each run uses a fresh account (golden principle 7).
test("quotes page lists my quotes newest first", async ({ page }) => {
  await signUpAs(page, `f048-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.getByRole("link", { name: "Quotes" }).click();
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(page.getByRole("heading", { name: "Quotes" })).toBeVisible();
  await expect(page.getByText("You have no quotes yet.")).toBeVisible();

  await addBook(page, "Middlemarch", "George Eliot");
  await addBook(page, "Persuasion", "Jane Austen");
  await saveQuote(page, "Middlemarch", MIDDLEMARCH, "42");
  await saveQuote(page, "Persuasion", PERSUASION);

  await page.goto("/quotes");
  const items = page.getByRole("list", { name: "My quotes" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText(PERSUASION);
  await expect(items.nth(0)).toContainText("Persuasion");
  await expect(items.nth(0)).not.toContainText("Page");
  await expect(items.nth(1)).toContainText(MIDDLEMARCH);
  await expect(items.nth(1)).toContainText("Page 42");
  await expect(page.getByText("You have no quotes yet.")).toHaveCount(0);

  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F048-quotes.png", { stylePath: "e2e/hide-dev-overlay.css", fullPage: true });

  await items.nth(1).getByRole("link", { name: "Middlemarch" }).click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();
});

// F049: search my quotes by text or book title, kept in the URL.
test("search quotes by text or book title", async ({ page }) => {
  await signUpAs(page, `f049-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await addBook(page, "Middlemarch", "George Eliot");
  await addBook(page, "Persuasion", "Jane Austen");
  await saveQuote(page, "Middlemarch", MIDDLEMARCH);
  await saveQuote(page, "Persuasion", PERSUASION);

  await page.goto("/quotes");
  const items = page.getByRole("list", { name: "My quotes" }).getByRole("listitem");
  const search = page.getByRole("search").getByLabel("Search");

  await search.fill("NARROW");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/quotes\?q=NARROW$/);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(MIDDLEMARCH);

  await search.fill("persua");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/quotes\?q=persua$/);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(PERSUASION);
  await page.reload();
  await expect(search).toHaveValue("persua");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(PERSUASION);

  await search.fill("zzz");
  await search.press("Enter");
  await expect(page.getByText("No quotes match “zzz”.")).toBeVisible();
  await page.getByRole("link", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(items).toHaveCount(2);
  await expect(search).toHaveValue("");

  await search.fill("narrow");
  await search.press("Enter");
  await expect(items).toHaveCount(1);
  await search.fill("");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(items).toHaveCount(2);
});
