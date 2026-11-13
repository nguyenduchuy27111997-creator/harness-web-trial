import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook, addTagsOnBookPage } from "./books";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// F067: the Tags page. A fresh account and books per test (golden principle 7).
test("tags page: lists tags with counts, renames, rejects a taken name", async ({ page }) => {
  await signUpAs(page, `f067-${stamp()}@example.com`);
  const first = `Emma ${stamp()}`;
  const second = `Persuasion ${stamp()}`;
  await addAndOpenBook(page, first, "Reading");
  await expect(page.getByRole("heading", { name: first })).toBeVisible();
  await addTagsOnBookPage(page, ["classic", "travel"]);
  await addAndOpenBook(page, second, "Reading");
  await expect(page.getByRole("heading", { name: second })).toBeVisible();
  await addTagsOnBookPage(page, ["classic", "adventure"]);

  await page.goto("/books");
  await page.getByRole("link", { name: "Tags", exact: true }).click();
  await expect(page).toHaveURL(/\/tags$/);
  await expect(page.getByRole("heading", { name: "Tags", exact: true })).toBeVisible();

  const row = (name: string) => page.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(name) }) });
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("adventure");
  await expect(rows.nth(1)).toContainText("classic");
  await expect(rows.nth(2)).toContainText("travel");
  await expect(row("classic").getByText("2 books")).toBeVisible();
  await expect(row("travel").getByText("1 book", { exact: true })).toBeVisible();
  await expect(row("classic").getByRole("link").first()).toHaveAttribute("href", "/books?tag=classic");

  // Rename on every book.
  await row("classic").getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("New name").fill("classics");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("New name")).toHaveCount(0);
  await expect(row("classics").getByText("2 books")).toBeVisible();
  await page.reload();
  await expect(row("classics").getByText("2 books")).toBeVisible();
  await expect(page.getByRole("link", { name: /^classic(?!s)/ })).toHaveCount(0);

  await page.goto("/books");
  for (const title of [first, second]) {
    const book = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: title }) });
    await expect(book.getByText("classics", { exact: true })).toBeVisible();
  }

  // A name another of my tags has.
  await page.goto("/tags");
  await row("travel").getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("New name").fill("adventure");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("You already have that tag")).toBeVisible();
  await page.reload();
  await expect(row("travel")).toBeVisible();

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await row("travel").getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("New name").fill("adventure");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("You already have that tag")).toBeVisible();
  await expect(page).toHaveScreenshot("F067-tags-taken.png", { stylePath: "e2e/hide-dev-overlay.css", fullPage: true });
});

test("tags page: empty state", async ({ page }) => {
  await signUpAs(page, `f067-empty-${stamp()}@example.com`);
  await page.getByRole("link", { name: "Tags", exact: true }).click();
  await expect(page).toHaveURL(/\/tags$/);
  await expect(page.getByText("No tags yet")).toBeVisible();
  await expect(page.getByText(/book's page/)).toBeVisible();
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F067-tags-empty.png", { stylePath: "e2e/hide-dev-overlay.css", fullPage: true });
});
