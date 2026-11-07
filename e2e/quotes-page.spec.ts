import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { openNewBookPage } from "./notes";

// F048: /quotes lists all my quotes newest first, each linking to its book. Fresh account (golden principle 7).
test("quotes page lists my quotes newest first", async ({ page }) => {
  test.slow();
  await signUpAs(page, `f048-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);

  await page.getByRole("link", { name: "Quotes", exact: true }).click();
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(page.getByRole("heading", { name: "Quotes", level: 1 })).toBeVisible();
  await expect(page.getByText("You have no quotes yet.")).toBeVisible();

  const saveQuote = async (text: string, pageNumber: string) => {
    const item = page.getByRole("list", { name: "Quotes from this book" }).getByRole("listitem").first();
    // The add form resets after a save, which can overwrite a fill made too early, so retry until it shows.
    await expect(async () => {
      await page.getByRole("textbox", { name: "Quote", exact: true }).fill(text);
      await page.getByRole("textbox", { name: "Page (optional)" }).fill(pageNumber);
      await page.getByRole("button", { name: "Save quote" }).click();
      await expect(item).toContainText(text, { timeout: 3000 });
    }).toPass();
  };
  await openNewBookPage(page, "Middlemarch", "George Eliot");
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
  const middlemarchUrl = page.url();
  await saveQuote("It is never too late to be what you might have been.", "42");
  await openNewBookPage(page, "Persuasion", "Jane Austen");
  await saveQuote("You pierce my soul.", "");

  await page.goto("/quotes");
  const items = page.getByRole("list", { name: "My quotes" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("You pierce my soul.");
  await expect(items.nth(0)).toContainText("Persuasion");
  await expect(items.nth(0)).not.toContainText("Page");
  await expect(items.nth(1)).toContainText("It is never too late to be what you might have been.");
  await expect(items.nth(1)).toContainText("Middlemarch");
  await expect(items.nth(1)).toContainText("Page 42");
  await expect(page.getByText("You have no quotes yet.")).toHaveCount(0);

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F048-quotes.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await items.nth(1).getByRole("link", { name: "Middlemarch" }).click();
  await expect(page).toHaveURL(middlemarchUrl);
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();
});

// F049: search my quotes by text or book title, kept in the URL.
const MIDDLEMARCH = "It is a narrow mind which cannot look at a subject from various points of view.";
const PERSUASION = "She had been forced into prudence in her youth, she learned romance as she grew older.";

test("search quotes by text or book title", async ({ page }) => {
  test.slow();
  await signUpAs(page, `f049-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  const saveQuote = async (title: string, author: string, text: string) => {
    await openNewBookPage(page, title, author);
    const item = page.getByRole("list", { name: "Quotes from this book" }).getByRole("listitem").first();
    await expect(async () => {
      await page.getByRole("textbox", { name: "Quote", exact: true }).fill(text);
      await page.getByRole("button", { name: "Save quote" }).click();
      await expect(item).toContainText(text, { timeout: 3000 });
    }).toPass();
  };
  await saveQuote("Middlemarch", "George Eliot", MIDDLEMARCH);
  await saveQuote("Persuasion", "Jane Austen", PERSUASION);

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
