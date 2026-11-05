import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F038: finishing a Reading book sets its page to the total. Fresh account (golden principle 7).
test("finishing a book sets its page to the total", async ({ page }) => {
  await signUpAs(page, `f038-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  const choose = async (name: string) => {
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name }).click();
  };
  const addReading = async (title: string) => {
    await page.goto("/books/new");
    for (const [label, value] of [["Title", title], ["Author", "Finish Author"]]) await page.getByLabel(label).fill(value);
    await choose("Reading");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("link", { name: title }).click();
  };
  const setStatus = async (name: string) => {
    await choose(name);
    await page.getByRole("button", { name: "Save status" }).click();
  };
  const progress = page.getByRole("heading", { name: "Progress", exact: true });

  await addReading("Finish Book");
  for (const [label, value] of [["Total pages", "250"], ["Current page", "100"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText("Page 100 of 250 (40%)")).toBeVisible();

  await setStatus("Finished");
  await expect(page.getByText("Finished").first()).toBeVisible();
  await expect(progress).toHaveCount(0);

  await setStatus("Reading");
  await expect(page.getByText("Page 250 of 250 (100%)")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Page 250 of 250 (100%)")).toBeVisible();

  await addReading("No Progress Book");
  await setStatus("Finished");
  await expect(progress).toHaveCount(0);
  await setStatus("Reading");
  await expect(progress).toBeVisible();
  await expect(page.getByText(/Page \d+ of/)).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F038-finish-progress.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
