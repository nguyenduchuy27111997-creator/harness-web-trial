import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

type Entry = { status: string; book?: { title: string; author: string; totalPages: number | null } };

// The fixture is keyed by the parsed query (ISBN digits, or the lower-cased title); pick found entries from it.
// Read inside the tests: the coder adds the fixture file.
function pick() {
  const fixture: Record<string, Entry> = JSON.parse(readFileSync("e2e/fixtures/lookup.json", "utf8"));
  const found = Object.entries(fixture).filter(([, e]) => e.status === "found" && e.book);
  return {
    isbnEntry: found.find(([key]) => /^\d{10}$|^\d{13}$/.test(key))!,
    titleEntry: found.find(([key]) => !/^\d+$/.test(key))!,
  };
}

// Names from the acceptance: a 'Look up' field and button; "Total pages" follows the existing progress form.
const lookupField = (page: import("@playwright/test").Page) => page.getByRole("textbox", { name: "Look up" });
const lookupButton = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Look up", exact: true });

test("an ISBN fills title, author and total pages, still editable, and saves", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("openlibrary.org")) outside.push(r.url());
  });
  await signUpAs(page, `f079-${stamp()}@example.com`);
  await page.goto("/books/new");
  await expect(lookupField(page)).toBeVisible();
  await expectAccessible(page);

  const [key, entry] = pick().isbnEntry;
  const book = entry.book!;
  await lookupField(page).fill(key);
  await lookupButton(page).click();
  await expect(page.getByLabel("Title")).toHaveValue(book.title);
  await expect(page.getByLabel("Author")).toHaveValue(book.author);
  if (book.totalPages !== null) await expect(page.getByLabel("Total pages")).toHaveValue(String(book.totalPages));

  // Edit before saving.
  const edited = `${book.title} ${stamp()}`;
  await page.getByLabel("Title").fill(edited);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  const row = page.getByRole("listitem").filter({ hasText: edited });
  await expect(row).toContainText(book.author);
  expect(outside).toEqual([]);
});

test("a title fills the form", async ({ page }) => {
  await signUpAs(page, `f079t-${stamp()}@example.com`);
  await page.goto("/books/new");
  const { titleEntry } = pick();
  const book = titleEntry[1].book!;
  await lookupField(page).fill(titleEntry[0]);
  await lookupButton(page).click();
  await expect(page.getByLabel("Title")).toHaveValue(book.title);
  await expect(page.getByLabel("Author")).toHaveValue(book.author);
  if (book.totalPages !== null) await expect(page.getByLabel("Total pages")).toHaveValue(String(book.totalPages));
  await expect(page.getByLabel("Title")).toBeEditable();
  await expect(page.getByLabel("Author")).toBeEditable();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F079-lookup-filled.png");
});
