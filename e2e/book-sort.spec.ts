import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

async function addBook(page: Page, title: string, status: string, rating?: number) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Some Author");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: status }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  if (rating) {
    await page.getByRole("link", { name: title }).click();
    const group = page.getByRole("radiogroup", { name: "Rating" });
    await group.getByRole("radio", { name: rating === 1 ? "1 star" : `${rating} stars` }).click();
    await page.getByRole("button", { name: "Rate" }).click();
    await expect(page.locator("form").filter({ has: group }).getByRole("status")).toHaveText("Saved");
  }
}

// F022: sort on /books, kept in the URL with the tab and the search. Fresh account per run (golden principle 7).
test("sort the shelf by newest, title or rating, kept in the URL", async ({ page }) => {
  test.slow(); // four books added through the forms before the sort starts
  await signUpAs(page, `f022-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await addBook(page, "Bravo", "Finished", 3);
  await addBook(page, "Alpha", "Finished", 5);
  await addBook(page, "Charlie", "Finished");
  await addBook(page, "Delta", "Reading");

  const rows = page.getByRole("listitem");
  const order = async () => (await rows.allInnerTexts()).map((t) => t.split("\n")[0].trim());
  const sort = page.getByLabel("Sort");

  await page.goto("/books");
  await expect(sort).toHaveText("Newest added");
  await expect.poll(order).toEqual(["Delta", "Charlie", "Alpha", "Bravo"]);

  await sort.click();
  await page.getByRole("option", { name: "Title A to Z" }).click();
  await expect(page).toHaveURL(/\/books\?sort=title$/);
  await expect.poll(order).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);

  await sort.click();
  await page.getByRole("option", { name: "Highest rated" }).click();
  await expect(page).toHaveURL(/\/books\?sort=rating$/);
  await expect.poll(order).toEqual(["Alpha", "Bravo", "Delta", "Charlie"]);

  await page.getByRole("navigation", { name: "Book filter" }).getByRole("link", { name: "Finished" }).click();
  await expect(page).toHaveURL(/\/books\?status=finished&sort=rating$/);
  await expect.poll(order).toEqual(["Alpha", "Bravo", "Charlie"]);

  await page.reload();
  await expect(sort).toHaveText("Highest rated");
  await expect(page.getByRole("link", { name: "Finished" })).toHaveAttribute("aria-current", "page");
  await expect.poll(order).toEqual(["Alpha", "Bravo", "Charlie"]);

  await page.goto("/books?sort=rating");
  await page.getByLabel("Search").fill("a");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/books\?q=a&sort=rating$/);
  await expect.poll(order).toEqual(["Alpha", "Bravo", "Delta", "Charlie"]);
  await page.mouse.move(0, 0); // axe must not catch the Search button mid hover transition
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F022-sorted-by-rating.png");
});
