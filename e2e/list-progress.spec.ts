import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F037: the list shows a percentage and a bar for Reading books with progress. Fresh account (golden principle 7).
test("list shows reading progress", async ({ page }) => {
  await signUpAs(page, `f037-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  const add = async (title: string, status: string) => {
    await page.goto("/books/new");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Author").fill("Some Author");
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: status }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/books$/);
  };
  await add("Tracked Book", "Reading");
  await add("Bare Reading Book", "Reading");
  await add("Future Book", "Want to read");

  await page.getByRole("link", { name: "Tracked Book" }).click();
  await page.getByLabel("Total pages").fill("250");
  await page.getByLabel("Current page").fill("100");
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText("Page 100 of 250 (40%)")).toBeVisible();

  await page.goto("/books");
  const row = (title: string) => page.getByRole("listitem").filter({ hasText: title });
  await expect(row("Tracked Book").getByText("40%")).toBeVisible();
  await expect(row("Tracked Book").getByRole("progressbar", { name: "Reading progress for Tracked Book" })).toHaveAttribute("aria-valuenow", "40");
  await expect(row("Bare Reading Book").getByText("%")).toHaveCount(0);
  await expect(row("Bare Reading Book").getByRole("progressbar")).toHaveCount(0);
  await expect(row("Future Book").getByText("%")).toHaveCount(0);
  await expect(row("Future Book").getByRole("progressbar")).toHaveCount(0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F037-list-progress.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await page.getByRole("link", { name: "Tracked Book" }).click();
  await page.getByLabel("Current page").fill("250");
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText("Page 250 of 250 (100%)")).toBeVisible();
  await page.goto("/books");
  await expect(row("Tracked Book").getByText("100%")).toBeVisible();
});
