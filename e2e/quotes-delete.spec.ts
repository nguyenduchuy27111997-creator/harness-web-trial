import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

const FIRST = "It is a narrow mind which cannot look at a subject from various points of view.";
const SECOND = "What do we live for, if it is not to make life less difficult to each other?";

// F047: delete a quote after confirming; the other quote and the book stay. Fresh account (golden principle 7).
test("delete a quote after confirming", async ({ page }) => {
  await signUpAs(page, `f047-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  for (const [label, value] of [["Title", "Middlemarch"], ["Author", "George Eliot"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Middlemarch" }).click();

  for (const quote of [FIRST, SECOND]) {
    await page.getByRole("textbox", { name: "Quote", exact: true }).fill(quote);
    await page.getByRole("button", { name: "Save quote" }).click();
    await expect(page.getByRole("list", { name: "Quotes from this book" })).toContainText(quote);
  }
  const items = page.getByRole("list", { name: "Quotes from this book" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  const dialog = page.getByRole("alertdialog");

  await items.filter({ hasText: SECOND }).getByRole("button", { name: "Delete" }).click();
  await expect(dialog.getByRole("heading", { name: "Delete this quote?" })).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(items).toHaveCount(2);

  await items.filter({ hasText: SECOND }).getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(FIRST);
  await page.reload();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(FIRST);
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();
  await expect(page).toHaveScreenshot("F047-quote-deleted.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    fullPage: true,
  });
});
