import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// F065: tag validation. A fresh account and book per test (golden principle 7).
async function openBook(page: import("@playwright/test").Page, who: string) {
  await signUpAs(page, `f065-${who}-${stamp()}@example.com`);
  const title = `Tag rules ${who} ${stamp()}`;
  await addAndOpenBook(page, title, "Reading");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return title;
}

async function addTag(page: import("@playwright/test").Page, name: string) {
  await page.getByLabel("Add tag").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

test("an empty tag shows 'Enter a tag' and adds nothing", async ({ page }) => {
  await openBook(page, "empty");
  await addTag(page, "");
  await expect(page.getByText("Enter a tag")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove tag / })).toHaveCount(0);
});

test("a tag over 24 characters is rejected", async ({ page }) => {
  await openBook(page, "long");
  await addTag(page, "a".repeat(25));
  await expect(page.getByText("Tags are at most 24 characters")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove tag / })).toHaveCount(0);
});

test("a duplicate tag is rejected whatever its case", async ({ page }) => {
  await openBook(page, "dup");
  await addTag(page, "classic");
  await expect(page.getByRole("button", { name: "Remove tag classic" })).toBeVisible();
  await addTag(page, "Classic");
  await expect(page.getByText("This book already has that tag")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove tag / })).toHaveCount(1);
});

test("an 11th tag is rejected", async ({ page }) => {
  const title = await openBook(page, "full");
  for (let i = 1; i <= 10; i++) {
    await addTag(page, `tag${i}`);
    await expect(page.getByRole("button", { name: `Remove tag tag${i}` })).toBeVisible();
  }
  await addTag(page, "tag11");
  await expect(page.getByText("A book has at most 10 tags")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove tag / })).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Remove tag tag11" })).toHaveCount(0);

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F065-tags-full.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    fullPage: true,
    mask: [page.getByText(title), page.getByText(/^Started on /), page.locator("time")],
  });
});
