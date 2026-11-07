import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { openNewBookPage } from "./notes";

// F050: deleting a book deletes its notes and quotes. Fresh account (golden principle 7).
const MIDDLEMARCH = "It is a narrow mind which cannot look at a subject from various points of view.";
const PERSUASION = "She had been forced into prudence in her youth, she learned romance as she grew older.";

test("deleting a book deletes its notes and quotes", async ({ page }) => {
  test.slow();
  await signUpAs(page, `f050-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  const urls: string[] = [];
  for (const [title, author, quote] of [["Middlemarch", "George Eliot", MIDDLEMARCH], ["Persuasion", "Jane Austen", PERSUASION]]) {
    await openNewBookPage(page, title, author);
    await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
    urls.push(page.url());
    if (title === "Middlemarch") {
      const notes = page.getByRole("region", { name: "Notes" });
      await notes.getByRole("textbox", { name: "Note" }).fill("Dorothea reminds me of my aunt");
      await notes.getByRole("button", { name: "Add note" }).click();
      await expect(notes.getByRole("listitem").first()).toContainText("Dorothea reminds me of my aunt");
    }
    const quotes = page.getByRole("list", { name: "Quotes from this book" });
    // A fill made before the form resets after the note save can be lost, so retry until the quote shows.
    await expect(async () => {
      await page.getByRole("textbox", { name: "Quote", exact: true }).fill(quote);
      await page.getByRole("textbox", { name: "Page (optional)" }).fill("42");
      await page.getByRole("button", { name: "Save quote" }).click();
      await expect(quotes.getByRole("listitem").first()).toContainText(quote, { timeout: 3000 });
    }).toPass();
  }
  const middlemarchUrl = urls[0];

  await page.goto("/quotes");
  const items = page.getByRole("list", { name: "My quotes" }).getByRole("listitem");
  await expect(items).toHaveCount(2);

  await page.goto(middlemarchUrl);
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: "Delete this book?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.getByRole("link", { name: "Quotes", exact: true }).click();
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(PERSUASION);
  await page.reload();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(PERSUASION);

  const search = page.getByRole("search").getByLabel("Search");
  await search.fill("narrow");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/quotes\?q=narrow$/);
  await expect(page.getByText("No quotes match “narrow”.")).toBeVisible();
  await expect(items).toHaveCount(0);

  await page.goto(middlemarchUrl);
  await expect(page.getByRole("heading", { name: "Book not found" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F050-not-found.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
