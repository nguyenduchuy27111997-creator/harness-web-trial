import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F024: change this year's reading goal. Each run uses a fresh account (golden principle 7).
test("stats: change the reading goal", async ({ page }) => {
  await signUpAs(
    page,
    `f024-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`,
  );

  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Change Goal Book");
  await page.getByLabel("Author").fill("Goal Author");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Finished" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/stats");
  await page.getByRole("textbox", { name: "Reading goal" }).fill("20");
  await page.getByRole("button", { name: "Set goal" }).click();
  await expect(
    page.getByText("1 of 20 books finished this year"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Change goal" }).click();
  await expect(page.getByRole("textbox", { name: "Reading goal" })).toHaveValue(
    "20",
  );
  await page.getByRole("textbox", { name: "Reading goal" }).fill("10");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(
    page.getByText("1 of 10 books finished this year"),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Reading goal progress" }),
  ).toHaveAttribute("aria-valuenow", "10");
  await page.reload();
  await expect(
    page.getByText("1 of 10 books finished this year"),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Reading goal progress" }),
  ).toHaveAttribute("aria-valuenow", "10");

  await page.getByRole("button", { name: "Change goal" }).click();
  await page.getByRole("textbox", { name: "Reading goal" }).fill("366");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(
    page.getByText("Goal must be a whole number from 1 to 365"),
  ).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F024-change-goal.png", {
    stylePath: "e2e/hide-dev-overlay.css",
  });
  await page.reload();
  await expect(
    page.getByText("1 of 10 books finished this year"),
  ).toBeVisible();
});
