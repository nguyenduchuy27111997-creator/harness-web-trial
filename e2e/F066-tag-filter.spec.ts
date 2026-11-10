import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook, tagOpenBook } from "./books";
import { createShelves, shelveOpenBook } from "./shelves";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

async function addTagged(page: Page, title: string, status: string, tags: string[], shelf?: string) {
  await addAndOpenBook(page, title, status);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await tagOpenBook(page, tags);
  if (shelf) await shelveOpenBook(page, shelf);
}

const params = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

// F066: the Tag select on /books, kept in the URL. Fresh account and books per test (golden principle 7).
test("filter by tag, kept in the URL and combined with tab, search, sort and shelf", async ({ page }) => {
  test.slow(); // books, tags and a shelf made through the forms first
  await signUpAs(page, `f066-${stamp()}@example.com`);
  const s = stamp();
  const alpha = `Alpha ${s}`;
  const bravo = `Bravo ${s}`;
  const charlie = `Charlie ${s}`;
  const delta = `Delta ${s}`;
  await createShelves(page, ["Travel"]);
  await addTagged(page, alpha, "Reading", ["classic"], "Travel");
  await addTagged(page, bravo, "Reading", ["classic", "travel"]);
  await addTagged(page, charlie, "Finished", ["classic"]);
  await addTagged(page, delta, "Reading", ["travel"]);

  await page.goto("/books");
  const tag = page.getByRole("combobox", { name: "Tag" });
  await tag.click();
  // All tags first, then my tags A to Z.
  await expect(page.getByRole("option")).toHaveText(["All tags", "classic", "travel"]);
  await page.getByRole("option", { name: "classic", exact: true }).click();
  await expect(page).toHaveURL(/\/books\?tag=classic$/);
  const link = (t: string) => page.getByRole("link", { name: t });
  await expect(link(alpha)).toBeVisible();
  await expect(link(bravo)).toBeVisible();
  await expect(link(charlie)).toBeVisible();
  await expect(link(delta)).toHaveCount(0);
  await page.reload();
  await expect(tag).toHaveText("classic");
  await expect(link(delta)).toHaveCount(0);
  await expect(link(alpha)).toBeVisible();

  // Combine with the status tab.
  await page.getByRole("navigation", { name: "Book filter" }).getByRole("link", { name: "Reading" }).click();
  await expect(page).toHaveURL(/status=reading/);
  await expect.poll(() => params(page)).toMatchObject({ status: "reading", tag: "classic" });
  await expect(link(charlie)).toHaveCount(0);
  await expect(link(alpha)).toBeVisible();
  await expect(link(bravo)).toBeVisible();

  // Sort.
  await page.getByLabel("Sort").click();
  await page.getByRole("option", { name: "Title A to Z" }).click();
  await expect.poll(() => params(page)).toMatchObject({ status: "reading", sort: "title", tag: "classic" });

  // Search.
  await page.getByLabel("Search").fill(`Bravo ${s}`);
  await page.getByRole("button", { name: "Search" }).click();
  await expect.poll(() => params(page)).toMatchObject({ status: "reading", q: `Bravo ${s}`, sort: "title", tag: "classic" });
  await expect(link(bravo)).toBeVisible();
  await expect(link(alpha)).toHaveCount(0);

  // Shelf: search cleared, shelf Travel keeps only Alpha.
  await page.goto("/books?status=reading&sort=title&tag=classic");
  await page.getByLabel("Shelf").click();
  await page.getByRole("option", { name: "Travel" }).click();
  await expect.poll(() => params(page)).toMatchObject({ status: "reading", sort: "title", tag: "classic" });
  await expect.poll(() => params(page).shelf).toMatch(/^[0-9a-f-]{36}$/);
  await expect(link(alpha)).toBeVisible();
  await expect(link(bravo)).toHaveCount(0);
  await page.reload();
  await expect(tag).toHaveText("classic");
  await expect(link(alpha)).toBeVisible();

  // Back to all tags drops only the tag.
  await tag.click();
  await page.getByRole("option", { name: "All tags" }).click();
  await expect.poll(() => params(page).tag).toBeUndefined();
  expect(params(page)).toMatchObject({ status: "reading", sort: "title" });
  expect(params(page).shelf).toBeTruthy();
});

test("a tag with no books in the tab shows the empty message and Show all tags", async ({ page }) => {
  await signUpAs(page, `f066-empty-${stamp()}@example.com`);
  const s = stamp();
  const reading = `Reading ${s}`;
  const finished = `Finished ${s}`;
  await addTagged(page, reading, "Reading", ["travel"]);
  await addTagged(page, finished, "Finished", ["classic"]);

  await page.goto("/books?status=reading&tag=classic");
  const show = page.getByRole("link", { name: "Show all tags" });
  await expect(show).toBeVisible();
  await expect(page.getByRole("link", { name: finished })).toHaveCount(0);
  await expect(page.getByRole("link", { name: reading })).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F066-tag-empty.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    fullPage: true,
    mask: [page.locator("time")],
  });

  await show.click();
  await expect.poll(() => params(page)).toEqual({ status: "reading" });
  await expect(page.getByRole("link", { name: reading })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Tag" })).toHaveText("All tags");
});
