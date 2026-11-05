import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F030: rename a shelf in place. Each run uses a fresh account (golden principle 7).
test("shelves: rename a shelf, with validation and cancel", async ({ page }) => {
  const stamp = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f030-${stamp}@example.com`);
  await page.goto("/shelves");
  const create = page.getByLabel("Name", { exact: true });
  for (const shelf of ["Travel", "Book club"]) {
    await create.fill(shelf);
    await page.getByRole("button", { name: "Create shelf" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: shelf })).toBeVisible();
  }

  const row = (name: string) => page.getByRole("listitem").filter({ hasText: name });
  const field = page.getByLabel("New name");

  await row("Travel").getByRole("button", { name: "Rename" }).click();
  await expect(field).toHaveValue("Travel");
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

  await row("Book club").getByRole("button", { name: "Rename" }).click();
  await expect(field).toHaveCount(1);
  await expect(field).toHaveValue("Book club");
  await row("Travel").getByRole("button", { name: "Rename" }).click();
  await expect(field).toHaveValue("Travel");

  await field.fill("Trips");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(field).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(row("Trips")).toBeVisible();
  await expect(row("Book club")).toBeVisible();
  await page.reload();
  await expect(row("Trips")).toBeVisible();
  await expect(row("Travel")).toHaveCount(0);

  await row("Trips").getByRole("button", { name: "Rename" }).click();
  await field.fill("book club");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(field).toHaveAccessibleDescription("You already have a shelf with that name");
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F030-rename-taken.png", { stylePath: "e2e/hide-dev-overlay.css" });
  await page.reload();
  await expect(row("Trips")).toBeVisible();

  await row("Trips").getByRole("button", { name: "Rename" }).click();
  await field.fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(field).toHaveAccessibleDescription("Name is required");

  await field.fill("Changed");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(field).toHaveCount(0);
  await expect(row("Trips")).toBeVisible();
  await expect(row("Changed")).toHaveCount(0);
});
