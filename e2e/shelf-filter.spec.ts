import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

async function addBook(page: Page, title: string, status: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Some Author");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: status }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/books$/);
}

async function putOnShelf(page: Page, title: string, shelf: string) {
  await page.goto("/books");
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible(); // /books has its own Shelf filter
  await page.getByRole("combobox", { name: "Shelf" }).click();
  await page.getByRole("option", { name: shelf }).click();
  await page.getByRole("button", { name: "Add to shelf" }).click();
  await expect(page.getByRole("list", { name: "Shelves this book is on" })).toContainText(shelf);
}

// F034: the shelf filter on /books, kept in the URL with the tab, search and sort. Fresh account (golden principle 7).
test("filter the list by shelf, kept in the URL", async ({ page }) => {
  test.slow(); // books and a shelf made through the forms first
  await signUpAs(page, `f034-${stamp()}@example.com`);
  await addBook(page, "Alpha", "Reading");
  await addBook(page, "Bravo", "Finished");
  await addBook(page, "Charlie", "Reading");
  await page.goto("/shelves");
  await page.getByLabel("Name", { exact: true }).fill("Travel");
  await page.getByRole("button", { name: "Create shelf" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Travel" })).toBeVisible();
  await putOnShelf(page, "Alpha", "Travel");
  await putOnShelf(page, "Bravo", "Travel");

  const rows = page.getByRole("listitem");
  const order = async () => (await rows.allInnerTexts()).map((t) => t.split("\n")[0].trim());
  const shelf = page.getByLabel("Shelf");

  await page.goto("/books");
  await shelf.click();
  await page.getByRole("option", { name: "Travel" }).click();
  await expect(page).toHaveURL(/\/books\?shelf=[0-9a-f-]{36}$/);
  const id = new URL(page.url()).searchParams.get("shelf")!;
  await expect.poll(order).toEqual(["Bravo", "Alpha"]);

  await page.getByRole("navigation", { name: "Book filter" }).getByRole("link", { name: "Reading" }).click();
  await expect(page).toHaveURL(`/books?status=reading&shelf=${id}`);
  await expect.poll(order).toEqual(["Alpha"]);
  await page.reload();
  await expect(shelf).toHaveText("Travel");
  await expect(page.getByRole("link", { name: "Reading" })).toHaveAttribute("aria-current", "page");
  await expect.poll(order).toEqual(["Alpha"]);

  await page.getByLabel("Sort").click();
  await page.getByRole("option", { name: "Title A to Z" }).click();
  await expect(page).toHaveURL(`/books?status=reading&sort=title&shelf=${id}`);
  await page.getByLabel("Search").fill("a");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(`/books?status=reading&q=a&sort=title&shelf=${id}`);
  await expect.poll(order).toEqual(["Alpha"]);
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F034-shelf-filter.png", { stylePath: "e2e/hide-dev-overlay.css" });

  await shelf.click();
  await page.getByRole("option", { name: "All shelves" }).click();
  await expect(page).toHaveURL("/books?status=reading&q=a&sort=title");
  await expect.poll(order).toEqual(["Alpha", "Charlie"]);
  await page.reload();
  await expect(shelf).toHaveText("All shelves");
});

test("an unknown shelf id is ignored", async ({ page }) => {
  await signUpAs(page, `f034-bad-${stamp()}@example.com`);
  await addBook(page, "Alpha", "Reading");
  await page.goto("/shelves");
  await page.getByLabel("Name", { exact: true }).fill("Travel");
  await page.getByRole("button", { name: "Create shelf" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Travel" })).toBeVisible();
  await page.goto("/books?shelf=11111111-1111-4111-8111-111111111111");
  await expect(page.getByRole("link", { name: "Alpha" })).toBeVisible();
  await expect(page.getByLabel("Shelf")).toHaveText("All shelves");
});
