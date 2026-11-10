import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// F064: tag a book from its page. A fresh account and book per test (golden principle 7).
test("book page: add and remove tags", async ({ page }) => {
  await signUpAs(page, `f064-${stamp()}@example.com`);
  const title = `Tagged ${stamp()}`;
  await addAndOpenBook(page, title, "Reading");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  const field = page.getByLabel("Add tag");
  const add = page.getByRole("button", { name: "Add", exact: true });
  const removes = page.getByRole("button", { name: /^Remove tag / });

  await field.fill("classic");
  await add.click();
  await expect(page.getByRole("button", { name: "Remove tag classic" })).toBeVisible();
  await expect(page.getByText("classic", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove tag classic" })).toBeVisible();
  await expect(page.getByText("classic", { exact: true })).toBeVisible();

  await field.fill("travel");
  await add.click();
  await expect(page.getByRole("button", { name: "Remove tag travel" })).toBeVisible();
  // Sorted A to Z.
  await expect(removes).toHaveCount(2);
  await expect(removes.nth(0)).toHaveAccessibleName("Remove tag classic");
  await expect(removes.nth(1)).toHaveAccessibleName("Remove tag travel");

  await page.getByRole("button", { name: "Remove tag travel" }).click();
  await expect(page.getByRole("button", { name: "Remove tag travel" })).toHaveCount(0);
  await expect(removes).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove tag classic" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove tag travel" })).toHaveCount(0);
  await expect(page.getByText("travel", { exact: true })).toHaveCount(0);

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F064-book-tagged.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    fullPage: true,
    mask: [page.getByText(title), page.locator("time")],
  });
});

test("book list: tags show under each title", async ({ page }) => {
  await signUpAs(page, `f064-list-${stamp()}@example.com`);
  const tagged = `Tagged list ${stamp()}`;
  const plain = `Plain list ${stamp()}`;
  await addAndOpenBook(page, plain, "Reading");
  await expect(page.getByRole("heading", { name: plain })).toBeVisible();
  await addAndOpenBook(page, tagged, "Reading");
  await expect(page.getByRole("heading", { name: tagged })).toBeVisible();
  for (const name of ["travel", "classic"]) {
    await page.getByLabel("Add tag").fill(name);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: `Remove tag ${name}` })).toBeVisible();
  }

  await page.goto("/books");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: tagged }) });
  await expect(row.getByText("classic", { exact: true })).toBeVisible();
  await expect(row.getByText("travel", { exact: true })).toBeVisible();
  const other = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: plain }) });
  await expect(other.getByText("classic", { exact: true })).toHaveCount(0);

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F064-list-tags.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    fullPage: true,
    mask: [page.getByRole("link", { name: tagged }), page.getByRole("link", { name: plain }), page.locator("time")],
  });
});
