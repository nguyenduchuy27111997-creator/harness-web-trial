import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F045: quote text is required up to 1,000 characters; the page is within the book. Fresh account (golden principle 7).
test("quote validation", async ({ page }) => {
  test.slow(); // two books and a retry on every submit
  await signUpAs(page, `f045-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Validated Quotes");
  await page.getByLabel("Author").fill("Some Author");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Validated Quotes" }).click();

  const list = page.getByRole("list", { name: "Quotes from this book" });
  const save = page.getByRole("button", { name: "Save quote" });
  const quoteField = page.getByRole("textbox", { name: "Quote", exact: true });
  const pageField = page.getByRole("textbox", { name: "Page (optional)" });
  // A server action answers a POST. The form resets after it, which can overwrite a fill made too early,
  // so retry until the POST carried the value.
  const submitWith = async (field: typeof quoteField, value: string, quote = "A valid quote") => {
    await expect(async () => {
      if (field === pageField) await quoteField.fill(quote);
      await field.fill(value);
      const answered = page.waitForResponse((r) => r.request().method() === "POST");
      await save.click();
      const response = await answered;
      expect(response.request().postData()).toContain(value);
    }).toPass();
  };
  const noQuotes = page.getByText("This book has no quotes yet.");

  // Empty and spaces-only text.
  await save.click();
  await expect(page.getByText("Quote is required")).toBeVisible();
  await submitWith(quoteField, "   ");
  await expect(page.getByText("Quote is required")).toBeVisible();
  await expect(quoteField).toHaveValue("   ");
  await expect(noQuotes).toBeVisible();

  // 1,001 characters.
  await submitWith(quoteField, "a".repeat(1001));
  await expect(page.getByText("Quote must be at most 1,000 characters")).toBeVisible();
  await expect(quoteField).toHaveValue("a".repeat(1001));
  await expect(noQuotes).toBeVisible();

  // No total pages: 1 to 10,000.
  for (const bad of ["0", "10001", "2.5"]) {
    await submitWith(pageField, bad);
    await expect(page.getByText("Page must be a whole number from 1 to 10,000")).toBeVisible();
    await expect(pageField).toHaveValue(bad);
    await expect(noQuotes).toBeVisible();
  }
  // The last two errors read the same, so wait for the action to finish: axe flagged a still-disabled Save.
  await expect(save).toBeEnabled();
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F045-quote-errors.png", { stylePath: "e2e/hide-dev-overlay.css" });
  await submitWith(pageField, "10000");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("listitem").first()).toContainText("Page 10000");

  // A Reading book with 250 total pages.
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Bounded Quotes");
  await page.getByLabel("Author").fill("Some Author");
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Reading" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Bounded Quotes" }).click();
  for (const [label, value] of [["Total pages", "250"], ["Current page", "100"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText("Page 100 of 250 (40%)")).toBeVisible();

  await submitWith(pageField, "251", "Bounded quote");
  await expect(page.getByText("Page must be a whole number from 1 to 250")).toBeVisible();
  await expect(pageField).toHaveValue("251");
  await expect(noQuotes).toBeVisible();
  await submitWith(pageField, "250", "Bounded quote");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("listitem").first()).toContainText("Page 250");
});
