import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F023: set a reading goal for this year. Each run uses a fresh account (golden principle 7).
test("stats: set a reading goal and see progress", async ({ page }) => {
  await signUpAs(page, `f023-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);

  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Goal Book");
  await page.getByLabel("Author").fill("Goal Author");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Finished" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/stats");
  await expect(page.getByText("Set a reading goal for this year")).toBeVisible();
  await expectAccessible(page);

  for (const bad of ["0", "366", "2.5"]) {
    await page.getByLabel("Reading goal").fill(bad);
    await page.getByRole("button", { name: "Set goal" }).click();
    // The same message repeats, so wait for the submission to settle before checking the field.
    await expect(page.getByRole("button", { name: "Set goal" })).toBeEnabled();
    await expect(page.getByText("Goal must be a whole number from 1 to 365")).toBeVisible();
    await expect(page.getByLabel("Reading goal")).toHaveValue(bad);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  }

  await page.getByLabel("Reading goal").fill("20");
  await page.getByRole("button", { name: "Set goal" }).click();
  await expect(page.getByText("1 of 20 books finished this year")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Reading goal progress" })).toHaveAttribute("aria-valuenow", "5");

  await page.reload();
  await expect(page.getByText("1 of 20 books finished this year")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Reading goal progress" })).toHaveAttribute("aria-valuenow", "5");
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F023-reading-goal.png", { stylePath: "e2e/hide-dev-overlay.css", mask: [page.getByRole("region", { name: "Finished by month" }).getByRole("list")] });
});
