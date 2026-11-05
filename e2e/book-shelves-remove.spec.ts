import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// F032: take a book off a shelf from its page. Fresh account (golden principle 7).
test("book page: remove a book from a shelf", async ({ page }) => {
  await signUpAs(page, `f032-${stamp()}@example.com`);
  await page.goto("/shelves");
  for (const shelf of ["Travel", "Book club"]) {
    await page.getByLabel("Name", { exact: true }).fill(shelf);
    await page.getByRole("button", { name: "Create shelf" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: shelf })).toBeVisible();
  }
  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Middlemarch");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Middlemarch" }).click();
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();

  const picker = page.getByRole("combobox", { name: "Shelf" });
  const onShelves = page.getByRole("list", { name: "Shelves this book is on" }).getByRole("listitem");
  for (const shelf of ["Travel", "Book club"]) {
    await picker.click();
    await page.getByRole("option", { name: shelf }).click();
    await page.getByRole("button", { name: "Add to shelf" }).click();
    await expect(onShelves.filter({ hasText: shelf })).toBeVisible();
  }
  await expect(onShelves).toHaveText(["Book club", "Travel"]);

  await page.getByRole("button", { name: "Remove from Travel" }).click();
  await expect(onShelves).toHaveText(["Book club"]);
  await page.reload();
  await expect(onShelves).toHaveText(["Book club"]);
  await expect(page.getByRole("button", { name: "Remove from Travel" })).toHaveCount(0);

  // Travel is offered again in the picker.
  await picker.click();
  await expect(page.getByRole("option")).toHaveText(["Travel"]);
  await page.keyboard.press("Escape");

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F032-removed.png", { stylePath: "e2e/hide-dev-overlay.css", fullPage: true });

  // The book and the shelf are kept.
  await page.goto("/books");
  await expect(page.getByRole("link", { name: "Middlemarch" })).toBeVisible();
  await page.goto("/shelves");
  await expect(page.getByRole("listitem").filter({ hasText: "Travel" })).toBeVisible();
});
