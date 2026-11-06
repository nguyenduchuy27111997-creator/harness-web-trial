import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

const FIRST = "It is a narrow mind which cannot look at a subject from various points of view.";
const SECOND = "What do we live for, if it is not to make life less difficult to each other?";

// F044: save quotes on a book's page, with an optional page, whatever the book's status.
// Each run uses a fresh account (golden principle 7).
test("save quotes from a book", async ({ page }) => {
  await page.goto("/sign-up");
  const email = `f044-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`;
  for (const [label, value] of [["Email", email], ["Password", "secret123"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.goto("/books/new");
  for (const [label, value] of [["Title", "Middlemarch"], ["Author", "George Eliot"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Middlemarch" }).click();

  const quoteField = page.getByRole("textbox", { name: "Quote", exact: true });
  const pageField = page.getByRole("textbox", { name: "Page (optional)" });
  const save = page.getByRole("button", { name: "Save quote" });
  const list = page.getByRole("list", { name: "Quotes from this book" });
  await expect(page.getByText("This book has no quotes yet.")).toBeVisible();
  await expect(quoteField).toBeVisible();
  await expect(pageField).toBeVisible();
  await expect(save).toBeVisible();

  await quoteField.fill(FIRST);
  await pageField.fill("42");
  await save.click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("listitem").first()).toContainText(FIRST);
  await expect(list.getByRole("listitem").first()).toContainText("Page 42");
  await expect(quoteField).toHaveValue("");
  await expect(pageField).toHaveValue("");
  await expect(page.getByText("This book has no quotes yet.")).toHaveCount(0);
  await page.reload();
  await expect(list.getByRole("listitem").first()).toContainText(FIRST);
  await expect(list.getByRole("listitem").first()).toContainText("Page 42");

  // A quote with no page goes on top, without a page number. Saved while the book is Finished.
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Finished" }).click();
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText(/Finished on/)).toBeVisible();
  await quoteField.fill(SECOND);
  await save.click();
  const items = list.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText(SECOND);
  await expect(items.nth(0)).not.toContainText("Page");
  await expect(items.nth(1)).toContainText(FIRST);

  // And while Reading.
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Reading" }).click();
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByRole("button", { name: "Save progress" })).toBeVisible();
  await quoteField.fill("Third quote.");
  await pageField.fill("7");
  await save.click();
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Third quote.");
  await expect(items.nth(0)).toContainText("Page 7");

  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F044-quotes.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    fullPage: true,
    mask: [page.getByText(/Finished on/)],
  });
});
