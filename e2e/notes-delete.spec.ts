import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { openNewBookPage } from "./notes";

// F043: delete a note after confirming; the other note and the book stay.
// Each run uses a fresh account (golden principle 7).
test("delete a note", async ({ page }) => {
  await signUpAs(page, `f043-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await openNewBookPage(page, "Middlemarch", "George Eliot");

  const notes = page.getByRole("region", { name: "Notes" });
  const field = notes.getByRole("textbox", { name: "Note", exact: true });
  const add = notes.getByRole("button", { name: "Add note" });
  await field.fill("Dorothea marries Casaubon");
  await add.click();
  await expect(notes.getByRole("listitem")).toHaveCount(1);
  await field.fill("Lydgate arrives in town");
  await add.click();
  const items = notes.getByRole("listitem");
  await expect(items).toHaveCount(2);
  const doomed = items.filter({ hasText: "Lydgate arrives in town" });

  await doomed.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this note?" });
  await expect(dialog).toContainText("This note will be deleted. This cannot be undone.");
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F043-confirm.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(items).toHaveCount(2);

  await doomed.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(items).toHaveCount(1);
  await expect(items).toContainText("Dorothea marries Casaubon");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();
  await expect(items).toHaveCount(1);
  await expect(items).toContainText("Dorothea marries Casaubon");
  await expect(notes).not.toContainText("Lydgate arrives in town");
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot("F043-after-delete.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [items.locator("p").nth(1)],
  });
});
