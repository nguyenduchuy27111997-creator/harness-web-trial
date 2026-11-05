import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F031: put a book on shelves from its page. Each run uses fresh accounts (golden principle 7).
test("book page: add a book to shelves, which it then lists", async ({ page }) => {
  const stamp = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f031-${stamp}@example.com`);

  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Middlemarch");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.getByRole("link", { name: "Middlemarch" }).click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);

  await expect(page.getByRole("heading", { name: "Shelves" })).toBeVisible();
  await expect(page.getByText("You have no shelves yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Make one on the Shelves page/ })).toHaveAttribute("href", "/shelves");
  await expect(page.getByRole("button", { name: "Add to shelf" })).toHaveCount(0);

  await page.goto("/shelves");
  for (const name of ["Travel", "Book club"]) {
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create shelf" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }

  await page.goto("/books");
  await page.getByRole("link", { name: "Middlemarch" }).click();
  await expect(page.getByText("This book is on no shelves.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to shelf" })).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel("Shelf").click();
  await page.getByRole("option", { name: "Travel" }).click();
  await page.getByRole("button", { name: "Add to shelf" }).click();
  const list = page.getByRole("list").filter({ hasText: "Travel" });
  await expect(list).toBeVisible();
  await expect(page.getByText("This book is on no shelves.")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("list").filter({ hasText: "Travel" })).toBeVisible();

  await page.getByLabel("Shelf").click();
  await expect(page.getByRole("option", { name: "Travel" })).toHaveCount(0);
  await page.getByRole("option", { name: "Book club" }).click();
  await page.getByRole("button", { name: "Add to shelf" }).click();
  await expect(page.getByRole("listitem")).toHaveText(["Book club", "Travel"]);
  await expect(page.getByRole("button", { name: "Add to shelf" })).toHaveCount(0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F031-book-shelves.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
