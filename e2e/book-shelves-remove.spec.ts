import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F032: take a book off a shelf. Each run uses fresh accounts (golden principle 7).
test("book page: remove a book from a shelf, which stays elsewhere", async ({ page }) => {
  const stamp = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f032-${stamp}@example.com`);

  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Middlemarch");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/shelves");
  for (const name of ["Travel", "Book club"]) {
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create shelf" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }

  await page.goto("/books");
  await page.getByRole("link", { name: "Middlemarch" }).click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
  const bookUrl = page.url();
  for (const name of ["Travel", "Book club"]) {
    await page.getByLabel("Shelf").click();
    await page.getByRole("option", { name }).click();
    await page.getByRole("button", { name: "Add to shelf" }).dispatchEvent("click");
    await expect(page.getByRole("button", { name: `Remove from ${name}` })).toBeVisible();
  }

  await page.getByRole("button", { name: "Remove from Travel" }).click();
  await expect(page.getByRole("button", { name: "Remove from Travel" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove from Book club" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove from Travel" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove from Book club" })).toBeVisible();
  await expectAccessible(page);

  await page.goto("/books");
  await expect(page.getByRole("link", { name: "Middlemarch" })).toBeVisible();
  await page.goto("/shelves");
  await expect(page.getByRole("listitem").filter({ hasText: "Travel" })).toBeVisible();
  await page.goto(bookUrl);
  await page.getByLabel("Shelf").click();
  await expect(page.getByRole("option", { name: "Travel" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveScreenshot("F032-book-shelves-removed.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
