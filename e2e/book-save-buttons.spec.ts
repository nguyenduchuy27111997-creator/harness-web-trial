import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F026: with the edit form open, the page's two submit buttons have different accessible names.
// Each run uses a fresh account (golden principle 7).
test("edit form open: the status and details Save buttons are told apart", async ({ page }) => {
  await signUpAs(page, `f026-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  for (const [label, value] of [["Title", "Midlemarch"], ["Author", "George Eliot"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Midlemarch" }).click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
  const names = await page.getByRole("button").evaluateAll((els) => els.map((el) => el.textContent?.trim()));
  expect(names.filter((n) => n?.startsWith("Save"))).toEqual(["Save details", "Save status"]);
  await expect(page.getByRole("button", { name: "Save status" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Save details" })).toHaveCount(1);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F026-edit-open-save-buttons.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
