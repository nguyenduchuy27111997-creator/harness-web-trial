import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

async function addBook(page: Page, title: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

// F031: put a book on shelves from its page. Fresh accounts (golden principle 7).
test("book page: add a book to shelves", async ({ page }) => {
  await signUpAs(page, `f031-${stamp()}@example.com`);
  await page.goto("/shelves");
  for (const shelf of ["Travel", "Book club"]) {
    await page.getByLabel("Name", { exact: true }).fill(shelf);
    await page.getByRole("button", { name: "Create shelf" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: shelf })).toBeVisible();
  }
  await addBook(page, "Middlemarch");

  await expect(page.getByRole("heading", { name: "Shelves", exact: true })).toBeVisible();
  await expect(page.getByText("This book is on no shelves.")).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Shelf" });
  const add = page.getByRole("button", { name: "Add to shelf" });
  await expect(add).toBeVisible();
  const onShelves = page.getByRole("list", { name: "Shelves this book is on" }).getByRole("listitem");

  await picker.click();
  await page.getByRole("option", { name: "Travel" }).click();
  await add.click();
  await expect(onShelves).toHaveText(["Travel"]);
  await page.reload();
  await expect(onShelves).toHaveText(["Travel"]);
  await expect(page.getByText("This book is on no shelves.")).toHaveCount(0);

  await picker.click();
  await expect(page.getByRole("option")).toHaveText(["Book club"]);
  await page.getByRole("option", { name: "Book club" }).click();
  await add.click();
  await expect(onShelves).toHaveText(["Book club", "Travel"]);
  // On every shelf, nothing is left to offer.
  await expect(picker).toHaveCount(0);
  await expect(add).toHaveCount(0);
  await page.reload();
  await expect(onShelves).toHaveText(["Book club", "Travel"]);

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F031-on-two-shelves.png", { stylePath: "e2e/hide-dev-overlay.css", fullPage: true });
});

test("book page: no shelves links to /shelves", async ({ page }) => {
  await signUpAs(page, `f031-none-${stamp()}@example.com`);
  await addBook(page, "Middlemarch");
  await expect(page.getByText("You have no shelves yet.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Shelf" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to shelf" })).toHaveCount(0);
  await expectAccessible(page);
  await page.getByRole("link", { name: "Make a shelf" }).click();
  await expect(page).toHaveURL(/\/shelves$/);
});
