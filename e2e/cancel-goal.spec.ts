import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F027: cancel the open "Change goal" form. Each run uses a fresh account (golden principle 7).
test("stats: cancel changing the reading goal", async ({ page }) => {
  await signUpAs(
    page,
    `f027-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`,
  );

  await page.goto("/stats");
  await page.getByRole("textbox", { name: "Reading goal" }).fill("20");
  await page.getByRole("button", { name: "Set goal" }).click();
  await expect(page.getByRole("button", { name: "Change goal" })).toBeVisible();

  await page.getByRole("button", { name: "Change goal" }).click();
  await page.getByRole("textbox", { name: "Reading goal" }).fill("7");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("textbox", { name: "Reading goal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change goal" })).toBeFocused();

  await page.getByRole("button", { name: "Change goal" }).click();
  await expect(page.getByRole("textbox", { name: "Reading goal" })).toHaveValue(
    "20",
  );
  await page.reload();
  await expect(page.getByText("of 20 books finished this year")).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F027-cancel-goal.png", {
    stylePath: "e2e/hide-dev-overlay.css",
  });
});
