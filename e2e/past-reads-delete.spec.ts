import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addBookWithStatus, finishAndRateBook, pastReadsBlock } from "./reads";

// F057: delete a past read after confirming. Each test uses a fresh account and book (golden principle 7).
test("delete a past read after confirming; the other read and the book stay", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const title = `Middlemarch ${tag}`;
  await signUpAs(page, `f057a-${tag}@example.com`);
  await addBookWithStatus(page, title, "Reading");
  await finishAndRateBook(page, 4);
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(pastReadsBlock(page)).toBeVisible();
  await finishAndRateBook(page, 5);
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(page.getByRole("button", { name: "Read again" })).toHaveCount(0);

  const items = pastReadsBlock(page).getByRole("listitem");
  const dialog = page.getByRole("alertdialog");
  await expect(items).toHaveCount(2);

  // Newest first: the 5-star read is first, the 4-star read second.
  await items.nth(1).getByRole("button", { name: "Delete" }).click();
  await expect(dialog.getByRole("heading", { name: "Delete this read?" })).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(items).toHaveCount(2);

  await items.nth(1).getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden();
  await expect(items).toHaveCount(1);

  const check = async () => {
    await expect(items).toHaveCount(1);
    await expect(items.first().getByText("5 stars")).toBeVisible();
    await expect(pastReadsBlock(page).getByText("4 stars")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Status" })).toContainText("Reading");
  };
  await check();
  await page.reload();
  await check();
  await expect(page).toHaveScreenshot("F057-past-read-deleted.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Started on/), page.getByText(/Finished on/), page.getByRole("heading", { level: 1 })],
  });
});

test("deleting the only past read hides the Past reads section", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f057b-${tag}@example.com`);
  await addBookWithStatus(page, `Persuasion ${tag}`, "Reading");
  const heading = page.getByRole("heading", { name: "Past reads" });
  await expect(heading).toHaveCount(0);

  await finishAndRateBook(page, 3);
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(heading).toBeVisible();
  const dialog = page.getByRole("alertdialog");
  await pastReadsBlock(page).getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden();
  await expect(heading).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Status" })).toContainText("Reading");
  await expect(heading).toHaveCount(0);
});
