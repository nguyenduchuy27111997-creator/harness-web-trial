import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F040: write notes on a book's page, newest first with their date, whatever the status.
// Each run uses a fresh account (golden principle 7).
test("add notes to a book", async ({ page }) => {
  await page.goto("/sign-up");
  const email = `f040-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`;
  for (const [label, value] of [["Email", email], ["Password", "secret123"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.goto("/books/new");
  for (const [label, value] of [["Title", "Middlemarch"], ["Author", "George Eliot"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Middlemarch" }).click();

  const notes = page.getByRole("region", { name: "Notes" });
  const field = notes.getByRole("textbox", { name: "Note" });
  await expect(notes.getByText("This book has no notes yet.")).toBeVisible();
  await expect(notes.getByRole("button", { name: "Add note" })).toBeVisible();

  const today = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date());
  const items = notes.getByRole("listitem");
  await field.fill("Dorothea reminds me of my aunt");
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Dorothea reminds me of my aunt");
  await expect(items.first()).toContainText(today);
  await expect(field).toHaveValue("");
  await page.reload();
  await expect(items.first()).toContainText("Dorothea reminds me of my aunt");

  await field.fill("Chapter 20 is the turning point");
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Chapter 20 is the turning point");
  await expect(items.nth(1)).toContainText("Dorothea reminds me of my aunt");

  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Finished" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("textbox", { name: "Review" })).toBeVisible();
  await field.fill("A third note");
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText("A third note");
  await expect(notes.getByRole("button", { name: "Add note" })).toBeEnabled();
  await page.mouse.move(0, 0); // the hover colour of the button just clicked is not what is checked
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F040-notes.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Finished on/), notes.getByText(today)],
  });
});
