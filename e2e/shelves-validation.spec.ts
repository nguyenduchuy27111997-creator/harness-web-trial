import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F029: shelf name validation. Each run uses fresh accounts (golden principle 7).
test("shelves: name is required, at most 40 characters and unique per account", async ({ page }) => {
  const stamp = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f029-${stamp}@example.com`);
  await page.goto("/shelves");
  const name = page.getByLabel("Name");
  const create = page.getByRole("button", { name: "Create shelf" });

  await create.click();
  await expect(name).toHaveAccessibleDescription("Name is required");
  await expect(page.getByRole("listitem")).toHaveCount(0);

  await name.fill("x".repeat(41));
  await create.click();
  await expect(name).toHaveAccessibleDescription("Name must be at most 40 characters");
  await expect(page.getByRole("listitem")).toHaveCount(0);

  await name.fill("Travel");
  await create.click();
  await expect(page.getByRole("listitem")).toContainText(["Travel"]);

  await name.fill("  travel ");
  await create.click();
  await expect(name).toHaveAccessibleDescription("You already have a shelf with that name");
  await expect(page.getByRole("listitem")).toContainText(["Travel"]);
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F029-shelf-name-taken.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signUpAs(page, `f029b-${stamp}@example.com`);
  await page.goto("/shelves");
  await name.fill("Travel");
  await create.click();
  await expect(page.getByRole("listitem")).toContainText(["Travel"]);
  await expect(name).toHaveValue("");
});
