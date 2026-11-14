import { expect, test } from "@playwright/test";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { expectAccessible } from "./a11y";
import { coverFile, submitCover } from "./covers";

const REFUSED = "Use a JPEG, PNG or WebP image up to 2 MB";
const MB = 1024 * 1024;

async function openBook(page: import("@playwright/test").Page, id: string) {
  const title = `Cover ${id} ${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f081-${id}-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await addAndOpenBook(page, title, "Reading");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return title;
}

// Button names 'Add cover', 'Replace cover', 'Remove cover' come from the acceptance; the file
// input is found by type, and choosing a file is followed by a click on the button (assumed).
test("add, replace and remove a cover, surviving reloads", async ({ page }) => {
  const title = await openBook(page, "crud");
  const cover = page.getByRole("img", { name: `Cover of ${title}` });
  await expect(cover).toHaveCount(0);

  await submitCover(page, coverFile("image/png"), "Add cover");
  await expect(cover).toBeVisible();
  await page.reload();
  await expect(cover).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace cover" })).toBeVisible();

  await submitCover(page, coverFile("image/webp", undefined, "new.webp"), "Replace cover");
  await expect(cover).toBeVisible();
  await page.reload();
  await expect(cover).toBeVisible();

  await page.getByRole("button", { name: "Remove cover" }).click();
  await expect(cover).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(cover).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add cover" })).toBeVisible();
  await expectAccessible(page);
});

test("a JPEG up to 2 MB uploads", async ({ page }) => {
  const title = await openBook(page, "jpeg");
  await submitCover(page, coverFile("image/jpeg", 2 * MB, "big.jpg"), "Add cover");
  await expect(page.getByRole("img", { name: `Cover of ${title}` })).toBeVisible();
});

test("files that are too big or of another type are refused and nothing is stored", async ({ page }) => {
  const title = await openBook(page, "refuse");
  const cover = page.getByRole("img", { name: `Cover of ${title}` });
  const refusals = [
    coverFile("image/png", 2 * MB + 1024), // between 2 and 3 MB
    coverFile("image/png", 3 * MB + 1024), // over the 3 MB action limit
    coverFile("image/gif", 100, "anim.gif"),
    coverFile("application/pdf", 100, "doc.pdf"),
  ];
  for (const file of refusals) {
    await submitCover(page, file, "Add cover");
    await expect(page.getByText(REFUSED)).toBeVisible();
    await expect(cover).toHaveCount(0);
  }
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(cover).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add cover" })).toBeVisible();
  await expectAccessible(page);
});

test("a refused replacement keeps the current cover", async ({ page }) => {
  const title = await openBook(page, "keep");
  const cover = page.getByRole("img", { name: `Cover of ${title}` });
  await submitCover(page, coverFile("image/png"), "Add cover");
  await expect(cover).toBeVisible();
  await submitCover(page, coverFile("image/png", 3 * MB + 1024), "Replace cover");
  await expect(page.getByText(REFUSED)).toBeVisible();
  await page.reload();
  await expect(cover).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F081-cover-upload.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByRole("heading", { level: 1 }), cover],
  });
});
