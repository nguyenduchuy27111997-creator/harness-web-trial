import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F043: delete a note after confirming. Each run uses a fresh account (golden principle 7).
test("delete a note after confirming", async ({ page }) => {
  await signUpAs(page, `f043-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Middlemarch");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Middlemarch" }).click();

  const notes = page.getByRole("region", { name: "Notes" });
  const items = notes.getByRole("listitem");
  for (const text of ["Dorothea reminds me of my aunt", "Chapter 20 is the turning point"]) {
    await notes.getByRole("textbox", { name: "Note" }).fill(text);
    await notes.getByRole("button", { name: "Add note" }).click();
    await expect(items.first()).toContainText(text);
  }
  await expect(items).toHaveCount(2);

  const newest = items.first();
  await newest.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this note?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("This note will be deleted. This cannot be undone.")).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(items).toHaveCount(2);

  await newest.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(items).toHaveCount(1);
  await expect(notes).not.toContainText("Chapter 20 is the turning point");
  await page.reload();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Dorothea reminds me of my aunt");
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot("F043-note-deleted.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [notes.getByText(/^\w+ \d{1,2}, \d{4}$/)],
  });
});
