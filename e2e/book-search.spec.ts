import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

async function addBook(page: Page, title: string, author: string, status: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill(author);
  if (status !== "Want to read") {
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: status }).click();
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
}

// F020: search on /books by title or author, kept in the URL. Fresh account per run (golden principle 7).
test("search the shelf by title or author, kept in the URL", async ({ page }) => {
  await signUpAs(page, `f020-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await addBook(page, "Middlemarch", "George Eliot", "Finished");
  await addBook(page, "Silas Marner", "George Eliot", "Reading");
  await addBook(page, "Emma", "Jane Austen", "Reading");

  const rows = page.getByRole("listitem");
  const search = page.getByLabel("Search");
  const submit = page.getByRole("button", { name: "Search" });

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
  await expect(rows).toHaveCount(2);
  const tabs = page.getByRole("navigation", { name: "Book filter" });
  await tabs.getByRole("link", { name: "Reading" }).click();
  await expect(page).toHaveURL(/\/books\?status=reading&q=eliot$/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Silas Marner");

  await page.reload();
  await expect(search).toHaveValue("eliot");
  await expect(tabs.getByRole("link", { name: "Reading" })).toHaveAttribute("aria-current", "page");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Silas Marner");
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F020-search-reading.png");

  await search.fill("");
  await submit.click();
  await expect(page).toHaveURL(/\/books\?status=reading$/);
  await expect(rows).toHaveCount(2);
});
