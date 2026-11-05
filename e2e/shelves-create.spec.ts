import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F028: make named shelves. Each run uses fresh accounts (golden principle 7).
test("shelves: create named shelves, own to each account", async ({ page }) => {
  const stamp = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f028-${stamp}@example.com`);

  await page.getByRole("link", { name: "Shelves" }).click();
  await expect(page).toHaveURL(/\/shelves$/);
  await expect(page.getByText("You have no shelves yet.")).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel("Name").fill("Travel");
  await page.getByRole("button", { name: "Create shelf" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Travel" })).toBeVisible();
  await expect(page.getByText("You have no shelves yet.")).toHaveCount(0);
  await expect(page.getByLabel("Name")).toHaveValue("");

  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Travel" })).toBeVisible();

  await page.getByLabel("Name").fill("Book club");
  await page.getByRole("button", { name: "Create shelf" }).click();
  await expect(page.getByRole("listitem")).toContainText(["Book club", "Travel"]);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F028-shelves.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signUpAs(page, `f028b-${stamp}@example.com`);
  await page.goto("/shelves");
  await expect(page.getByText("You have no shelves yet.")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);
});
