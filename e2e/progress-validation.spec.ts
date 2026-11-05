import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F036: progress validation errors next to the field. Fresh account (golden principle 7).
test("progress validation errors", async ({ page }) => {
  await signUpAs(page, `f036-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Validation Book");
  await page.getByLabel("Author").fill("Validation Author");
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Reading" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Validation Book" }).click();

  const total = page.getByLabel("Total pages");
  const current = page.getByLabel("Current page");
  const save = page.getByRole("button", { name: "Save progress" });
  const totalError = "Total pages must be a whole number from 1 to 10,000";

  await total.fill("100");
  await current.fill("40");
  await save.click();
  await expect(page.getByText("Page 40 of 100 (40%)")).toBeVisible();

  // Reload between attempts: the error text repeats, so a stale one would satisfy the next assertion.
  for (const bad of ["", "0", "10001", "2.5"]) {
    await page.reload();
    await total.fill(bad);
    await current.fill("1");
    await save.click();
    await expect(page.getByText(totalError)).toBeVisible();
    await expect(total).toHaveAccessibleDescription(totalError);
  }

  for (const bad of ["251", "-1"]) {
    await page.reload();
    await total.fill("250");
    await current.fill(bad);
    await save.click();
    await expect(page.getByText("Current page must be a whole number from 0 to 250")).toBeVisible();
    await expect(current).toHaveAccessibleDescription("Current page must be a whole number from 0 to 250");
  }

  await page.reload();
  await expect(page.getByText("Page 40 of 100 (40%)")).toBeVisible();

  await total.fill("250");
  await current.fill("0");
  await save.click();
  await expect(page.getByText("Page 0 of 250 (0%)")).toBeVisible();
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F036-progress-validation.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
