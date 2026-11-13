import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { IMPORT_HEADER as HEADER, importFile, openLibrary } from "./imports";

const tagOf = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

test("rows without a title, with an unknown status or a bad rating are left out and listed", async ({ page }) => {
  const tag = tagOf();
  await signUpAs(page, `f070-a-${tag}@example.com`);
  const good = `Report Good ${tag}`;
  const badStatus = `Report Odd Status ${tag}`;
  const badRating = `Report Odd Rating ${tag}`;
  const text = [
    HEADER,
    `${good},Ann Author,want_to_read,,,,`,
    `,Bob Writer,want_to_read,,,,`,
    `${badStatus},Cy Author,abandoned,,,,`,
    `${badRating},Di Author,finished,9,,,`,
    "",
  ].join("\n");

  await openLibrary(page);
  await importFile(page, text);

  const preview = page.getByRole("table");
  await expect(preview.getByText(good)).toBeVisible();
  await expect(preview.getByText(badStatus)).toHaveCount(0);
  await expect(preview.getByText(badRating)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add 1 book" })).toBeVisible();
  await expect(page.getByText("3 rows will be skipped")).toBeVisible();
  await expect(page.getByText(/Row 3: No title/)).toBeVisible();
  await expect(page.getByText(/Row 4: Unknown status/)).toBeVisible();
  await expect(page.getByText(/Row 5: Rating must be 1 to 5/)).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F070-import-skipped.png", {
    mask: [page.getByLabel("Import CSV"), preview],
  });
});

test("a book already on the shelf is skipped, and the result says Added N books, skipped M", async ({ page }) => {
  const tag = tagOf();
  await signUpAs(page, `f070-b-${tag}@example.com`);
  const have = `Report Have ${tag}`;
  const fresh = `Report Fresh ${tag}`;

  await openLibrary(page);
  await importFile(page, `${HEADER}\n${have},Ann Author,want_to_read,,,,\n`);
  await page.getByRole("button", { name: "Add 1 book" }).click();
  await expect(page.getByText(/Added 1 book/)).toBeVisible();

  await importFile(
    page,
    [HEADER, `${have},Ann Author,reading,,,,`, `${fresh},Bob Writer,want_to_read,,,,`, ""].join("\n"),
  );
  const preview = page.getByRole("table");
  await expect(preview.getByText(fresh)).toBeVisible();
  await expect(preview.getByText(have)).toHaveCount(0);
  await expect(page.getByText("1 row will be skipped")).toBeVisible();
  await expect(page.getByText(/Row 2: Already on your shelf/)).toBeVisible();

  await page.getByRole("button", { name: "Add 1 book" }).click();
  await expect(page.getByText("Added 1 book, skipped 1")).toBeVisible();

  await page.goto("/books");
  await expect(page.getByRole("link", { name: fresh })).toBeVisible();
  await expect(page.getByRole("link", { name: have })).toHaveCount(1);
});
