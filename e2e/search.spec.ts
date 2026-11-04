import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";

async function signUp(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
}

async function addBook(page: Page, title: string, author: string, status: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill(author);
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: status }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
}

// F020: search by title or author, kept in the URL with the status tab. Fresh account (golden principle 7).
test("search the shelf by title or author, kept in the URL", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUp(page, `f020-${tag}@example.com`);
  await addBook(page, "Middlemarch", "George Eliot", "Finished");
  await addBook(page, "Silas Marner", "George Eliot", "Reading");
  await addBook(page, "Emma", "Jane Austen", "Reading");

  const search = page.getByRole("searchbox", { name: "Search" });
  const submit = page.getByRole("button", { name: "Search" });
  const rows = page.getByRole("listitem");
  const tabs = page.getByRole("navigation", { name: "Book filter" });

  await search.fill("ELIO");
  await submit.click();
  await expect(page).toHaveURL(/\/books\?q=ELIO$/);
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Middlemarch" })).toBeVisible();
  await expect(rows.filter({ hasText: "Silas Marner" })).toBeVisible();

  await search.fill("march");
  await submit.click();
  await expect(page).toHaveURL(/\/books\?q=march$/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Middlemarch");

  await search.fill("eliot");
  await submit.click();
  await expect(page).toHaveURL(/\/books\?q=eliot$/);
  await tabs.getByRole("link", { name: "Reading" }).click();
  await expect(page).toHaveURL(/\/books\?status=reading&q=eliot$/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Silas Marner");

  await page.reload();
  await expect(search).toHaveValue("eliot");
  await expect(tabs.getByRole("link", { name: "Reading" })).toHaveAttribute("aria-current", "page");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Silas Marner");

  await search.fill("");
  await submit.click();
  await expect(page).toHaveURL(/\/books\?status=reading$/);
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Silas Marner" })).toBeVisible();
  await expect(rows.filter({ hasText: "Emma" })).toBeVisible();
  await expect(search).toHaveValue("");
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F020-search-cleared.png");
});
