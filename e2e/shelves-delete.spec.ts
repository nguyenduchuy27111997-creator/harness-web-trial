import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addBookOnShelf, createShelves } from "./shelves";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// F033: delete a shelf after confirming; its books are kept. Fresh account (golden principle 7).
test("shelves: delete a shelf, keeping its books", async ({ page }) => {
  await signUpAs(page, `f033-${stamp()}@example.com`);
  await createShelves(page, ["Travel", "Book club"]);
  await addBookOnShelf(page, "Middlemarch", "George Eliot", "Travel");
  const bookUrl = page.url();
  const onShelves = page.getByRole("list", { name: "Shelves this book is on" }).getByRole("listitem");
  await expect(onShelves).toHaveText(["Travel"]);

  await page.goto("/shelves");
  const travel = page.getByRole("listitem").filter({ hasText: "Travel" });
  const dialog = page.getByRole("alertdialog");

  await travel.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toContainText("Travel");
  await expect(dialog).toContainText("Its books are kept.");
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(travel).toBeVisible();

  await travel.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(travel).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveText([/Book club/]);
  await page.reload();
  await expect(travel).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: "Book club" })).toBeVisible();

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F033-deleted.png", { stylePath: "e2e/hide-dev-overlay.css", fullPage: true });

  // The book is kept and is on no shelf.
  await page.goto("/books");
  await expect(page.getByRole("link", { name: "Middlemarch" })).toBeVisible();
  await page.goto(bookUrl);
  await expect(page.getByRole("button", { name: "Remove from Travel" })).toHaveCount(0);
  await expect(onShelves).toHaveCount(0);
  await expect(page.getByText("This book is on no shelves.")).toBeVisible();
});
