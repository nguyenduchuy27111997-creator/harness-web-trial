import { expect, test } from "@playwright/test";
import { expectAccessible, expectScreens } from "./a11y";
import { signUpAs } from "./accounts";

// F073: a display name in the account menu (moved there by F089). Each test has its own account (golden principle 7).
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

test("the navigation links to Settings, and saving a display name shows it in the account menu", async ({ page }) => {
  await signUpAs(page, `f073a-${stamp()}@example.com`);
  const header = page.getByRole("banner");

  // Without a display name the account menu shows no name (a fresh account has none).
  await expect(header.getByText("Huy", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByLabel("Display name").fill("Huy");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(header.getByText("Huy", { exact: true })).toBeVisible();

  // The account menu shows the name, with Sign out in it.
  await header.getByRole("button", { name: "Huy" }).click();
  await expect(page.getByRole("menu").getByText("Huy", { exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(header.getByText("Huy", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue("Huy");

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F073-display-name-saved.png", { stylePath: "e2e/hide-dev-overlay.css" });
});

test("an empty or too long display name is rejected and the header keeps its name", async ({ page }) => {
  await signUpAs(page, `f073b-${stamp()}@example.com`);
  const header = page.getByRole("banner");
  await page.goto("/settings");
  const field = page.getByLabel("Display name");
  await expect(field).toBeVisible();

  await field.fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Enter a name")).toBeVisible();

  await field.fill("x".repeat(41));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Names are at most 40 characters")).toBeVisible();
  await expect(page.getByText("Enter a name")).toHaveCount(0);

  await field.fill("Huy");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(header.getByText("Huy", { exact: true })).toBeVisible();
  await expect(page.getByText("Names are at most 40 characters")).toHaveCount(0);
  await expectAccessible(page);
  await expectScreens(page, "F073-display-name-end");
});
