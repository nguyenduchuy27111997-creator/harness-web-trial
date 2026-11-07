import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F046: edit a quote in place. Fresh account (golden principle 7).
test("edit a quote", async ({ page }) => {
  test.slow();
  await signUpAs(page, `f046-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Editable Quotes");
  await page.getByLabel("Author").fill("Some Author");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Editable Quotes" }).click();

  const quoteField = page.getByRole("textbox", { name: "Quote", exact: true });
  const pageField = page.getByRole("textbox", { name: "Page (optional)" });
  const list = page.getByRole("list", { name: "Quotes from this book" });
  const item = list.getByRole("listitem").first();
  const editText = page.getByRole("textbox", { name: "Edit quote" });
  const editPage = page.getByRole("textbox", { name: "Edit page" });
  // After a reload the click can land before hydration, so retry until the form opens.
  const openEdit = () =>
    expect(async () => {
      await item.getByRole("button", { name: "Edit" }).click();
      await expect(editText).toBeVisible({ timeout: 2000 });
    }).toPass();
  // The add form resets after a save, which can overwrite a fill made too early, so retry until it shows.
  await expect(async () => {
    await quoteField.fill("Original text");
    await pageField.fill("42");
    await page.getByRole("button", { name: "Save quote" }).click();
    await expect(item).toContainText("Original text", { timeout: 3000 });
  }).toPass();
  await expect(item).toContainText("Page 42");

  // Prefilled, with Save and Cancel.
  await openEdit();
  await expect(editText).toHaveValue("Original text");
  await expect(editPage).toHaveValue("42");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

  await page.mouse.move(0, 0);
  await expectAccessible(page);

  // Cancel leaves it unchanged.
  await editText.fill("Discarded");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(editText).toHaveCount(0);
  await expect(item).toContainText("Original text");

  // Empty text is refused and nothing changes.
  await openEdit();
  await editText.fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Quote is required")).toBeVisible();
  await page.reload();
  await expect(item).toContainText("Original text");

  // New text and page 43.
  await openEdit();
  await editText.fill("Changed text");
  await editPage.fill("43");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editText).toHaveCount(0);
  await expect(item).toContainText("Changed text");
  await expect(item).toContainText("Page 43");
  await page.reload();
  await expect(item).toContainText("Changed text");
  await expect(item).toContainText("Page 43");

  // Clearing the page removes it.
  await openEdit();
  await editPage.fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editText).toHaveCount(0);
  await expect(item).toContainText("Changed text");
  await expect(item).not.toContainText("Page");
  await page.reload();
  await expect(item).not.toContainText("Page");
  await openEdit();
  await expect(editText).toHaveValue("Changed text");
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot("F046-quote-edit.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
