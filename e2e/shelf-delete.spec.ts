import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F033: delete a shelf after confirming; its books stay. Each run uses a fresh account (golden principle 7).
test("shelves: delete a shelf after confirming, keeping its books", async ({ page }) => {
  const stamp = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f033-${stamp}@example.com`);

  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Middlemarch");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/shelves");
  await page.getByLabel("Name").fill("Travel");
  await page.getByRole("button", { name: "Create shelf" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Travel" })).toBeVisible();

  await page.goto("/books");
  await page.getByRole("link", { name: "Middlemarch" }).click();
  await page.getByLabel("Shelf").click();
  await page.getByRole("option", { name: "Travel" }).click();
  await page.getByRole("button", { name: "Add to shelf" }).click();
  await expect(page.getByRole("button", { name: "Add to shelf" })).toHaveCount(0);

  await page.goto("/shelves");
  const row = page.getByRole("listitem").filter({ hasText: "Travel" });
  await row.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Travel");
  await expect(dialog).toContainText("books on it are kept");
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("You have no shelves yet.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Travel")).toHaveCount(0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F033-shelves-after-delete.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await page.goto("/books");
  await page.getByRole("link", { name: "Middlemarch" }).click();
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();
  await expect(page.getByText("Travel")).toHaveCount(0);
});
