import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F035: record progress on a Reading book; hidden unless Reading. Fresh account (golden principle 7).
test("record reading progress", async ({ page }) => {
  await signUpAs(page, `f035-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Progress Book");
  await page.getByLabel("Author").fill("Progress Author");
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Reading" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Progress Book" }).click();

  const total = page.getByLabel("Total pages");
  const current = page.getByLabel("Current page");
  await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
  await total.fill("250");
  await current.fill("100");
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText("Page 100 of 250 (40%)")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Page 100 of 250 (40%)")).toBeVisible();
  await expect(total).toHaveValue("250");

  const setStatus = async (name: string) => {
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name }).click();
    await page.getByRole("button", { name: "Save status" }).click();
  };
  await setStatus("Want to read");
  await expect(page.getByText("Want to read").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Progress", exact: true })).toHaveCount(0);
  await setStatus("Reading");
  await expect(page.getByText("Page 100 of 250 (40%)")).toBeVisible();

  await expect(page.getByRole("button", { name: "Save status" })).toBeEnabled();
  await page.mouse.move(0, 0); // the hover colour of the last-clicked button is below contrast
  await expectAccessible(page);
  await page.evaluate(() => window.scrollTo(0, 0)); // the Started on line makes the page taller, so the last click scrolled it
  await expect(page).toHaveScreenshot("F035-progress.png", { stylePath: "e2e/hide-dev-overlay.css", mask: [page.getByText(/Started on/)] });
});
