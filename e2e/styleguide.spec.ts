import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// Visual baseline of the design system (docs/design-system.md). A change to a token or
// base component shows up here; update the baseline only when the change is intended.
test("styleguide shows every token and base component", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByRole("heading", { name: "Styleguide" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("styleguide.png", { fullPage: true });
});
