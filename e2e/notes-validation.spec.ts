import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F041: a note is required and at most 2,000 characters.
// Each run uses a fresh account (golden principle 7).
test("note validation", async ({ page }) => {
  await signUpAs(page, `f041-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Middlemarch");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Middlemarch" }).click();

  const notes = page.getByRole("region", { name: "Notes" });
  const field = notes.getByRole("textbox", { name: "Note" });
  const add = notes.getByRole("button", { name: "Add note" });
  const items = notes.getByRole("listitem");

  await add.click();
  await expect(notes.getByText("Note is required")).toBeVisible();
  await expect(add).toBeEnabled();
  await field.fill("   ");
  await add.click();
  await expect(notes.getByText("Note is required")).toBeVisible();
  await expect(field).toHaveValue("   "); // the form has reset to the kept text
  await expect(add).toBeEnabled();
  await expect(items).toHaveCount(0);

  const tooLong = "a".repeat(2001);
  await field.fill(tooLong);
  await add.click();
  await expect(notes.getByText("Note must be at most 2,000 characters")).toBeVisible();
  await expect(field).toHaveValue(tooLong);
  await expect(items).toHaveCount(0);
  await expect(add).toBeEnabled();
  await page.mouse.move(0, 0); // the hover colour of the button just clicked is not what is checked
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F041-too-long.png", { stylePath: "e2e/hide-dev-overlay.css" });

  const exact = "b".repeat(2000);
  await field.fill(exact);
  await add.click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(exact);
  await expect(notes.getByText("Note must be at most 2,000 characters")).toHaveCount(0);
});
