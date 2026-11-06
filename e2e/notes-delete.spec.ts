import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F043: delete a note after confirming; the other note and the book are kept. Fresh account (golden principle 7).
test("notes: delete a note after confirming", async ({ page }) => {
  await signUpAs(page, `f043-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  for (const [label, value] of [["Title", "Middlemarch"], ["Author", "George Eliot"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Middlemarch" }).click();

  const notes = page.getByRole("region", { name: "Notes" });
  const items = notes.getByRole("listitem");
  for (const text of ["Dorothea reminds me of my aunt", "Chapter 20 is the turning point"]) {
    await notes.getByRole("textbox", { name: "Note" }).fill(text);
    await notes.getByRole("button", { name: "Add note" }).click();
    await expect(items.filter({ hasText: text })).toHaveCount(1);
  }
  await expect(items).toHaveCount(2);

  const aunt = items.filter({ hasText: "Dorothea reminds me of my aunt" });
  const dialog = page.getByRole("alertdialog");
  await aunt.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toContainText("Delete this note?");
  await expect(dialog).toContainText("This note will be deleted. This cannot be undone.");
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(items).toHaveCount(2);

  await aunt.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(aunt).toHaveCount(0);
  await expect(items).toHaveText([/Chapter 20 is the turning point/]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Middlemarch" })).toBeVisible();
  await expect(items).toHaveText([/Chapter 20 is the turning point/]);

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  const today = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date());
  await expect(notes).toHaveScreenshot("F043-note-deleted.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [notes.getByText(today)],
  });
});
