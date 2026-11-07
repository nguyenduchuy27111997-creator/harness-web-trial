import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { openNewBookPage } from "./notes";

// F042: edit a note in place; the date stays.
// Each run uses a fresh account (golden principle 7).
test("edit a note", async ({ page }) => {
  await signUpAs(page, `f042-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await openNewBookPage(page, "Middlemarch", "George Eliot");

  const notes = page.getByRole("region", { name: "Notes" });
  await notes.getByRole("textbox", { name: "Note", exact: true }).fill("Chapter 20 is the turing point");
  await notes.getByRole("button", { name: "Add note" }).click();
  const item = notes.getByRole("listitem");
  await expect(item).toContainText("turing point");
  const date = await item.locator("p").nth(1).innerText();

  await item.getByRole("button", { name: "Edit" }).click();
  const field = notes.getByRole("textbox", { name: "Edit note" });
  await expect(field).toHaveValue("Chapter 20 is the turing point");
  await expect(notes.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(notes.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F042-edit-open.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await field.fill("Chapter 20 is the turning point");
  await notes.getByRole("button", { name: "Save" }).click();
  await expect(item).toContainText("Chapter 20 is the turning point");
  await expect(notes.getByRole("textbox", { name: "Edit note" })).toHaveCount(0);
  await expect(item).toContainText(date);
  await page.reload();
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Chapter 20 is the turning point");
  await expect(item).toContainText(date);

  await item.getByRole("button", { name: "Edit" }).click();
  await notes.getByRole("textbox", { name: "Edit note" }).fill("   ");
  await notes.getByRole("button", { name: "Save" }).click();
  await expect(notes.getByText("Note is required")).toBeVisible();
  await page.reload();
  await expect(item).toContainText("Chapter 20 is the turning point");

  await item.getByRole("button", { name: "Edit" }).click();
  await notes.getByRole("textbox", { name: "Edit note" }).fill("Something else");
  await notes.getByRole("button", { name: "Cancel" }).click();
  await expect(notes.getByRole("textbox", { name: "Edit note" })).toHaveCount(0);
  await expect(item).toContainText("Chapter 20 is the turning point");
  await expect(item).not.toContainText("Something else");
});
