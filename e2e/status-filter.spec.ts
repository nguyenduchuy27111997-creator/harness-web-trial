import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";

async function signUp(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
}

async function addBook(page: Page, title: string, status: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Some Author");
  if (status !== "Want to read") {
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: status }).click();
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
}

// F013: status tabs on /books, kept in the URL. Each run uses a fresh account (golden principle 7).
test("filter the list by status with tabs kept in the URL", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUp(page, `f013-${tag}@example.com`);

  const tabs = page.getByRole("navigation", { name: "Book filter" });
  await expect(tabs.getByRole("link", { name: "All" })).toBeVisible();

  const books = [
    { title: "Wanted Book", status: "Want to read" },
    { title: "Current Book", status: "Reading" },
    { title: "Done Book", status: "Finished" },
  ];
  for (const book of books) {
    await addBook(page, book.title, book.status);
    await expect(page.getByRole("listitem").filter({ hasText: book.title })).toBeVisible();
  }

  const rows = page.getByRole("listitem");
  for (const name of ["All", "Want to read", "Reading", "Finished"]) {
    await expect(tabs.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(tabs.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  await expect(rows).toHaveCount(3);

  await tabs.getByRole("link", { name: "Reading" }).click();
  await expect(page).toHaveURL(/\/books\?status=reading$/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Current Book");

  await page.reload();
  await expect(tabs.getByRole("link", { name: "Reading" })).toHaveAttribute("aria-current", "page");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Current Book");

  await page.goto("/books?status=finished");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Done Book");
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F013-finished-tab.png");

  await tabs.getByRole("link", { name: "All" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(rows).toHaveCount(3);

  // A tab with no books: a fresh account with one book has nothing under Finished.
  await page.context().clearCookies();
  await signUp(page, `f013b-${tag}@example.com`);
  await addBook(page, "Only Book", "Want to read");
  await tabs.getByRole("link", { name: "Finished" }).click();
  await expect(page.getByText("No books here. Add one or switch tabs.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add book" })).toBeVisible();
  await expect(rows).toHaveCount(0);
});
