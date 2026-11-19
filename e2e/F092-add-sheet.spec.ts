import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectScreens } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

type Match = { title: string; author: string; totalPages: number | null };

// Read inside the tests: the coder moves the fixture to the new shape ({ status: "found", books: [...] }).
function titleEntry(): [string, Match[]] {
  const fixture: Record<string, { status: string; books?: Match[] }> = JSON.parse(
    readFileSync("e2e/fixtures/lookup.json", "utf8"),
  );
  const found = Object.entries(fixture).filter(([key, e]) => e.status === "found" && e.books && !/^\d+$/.test(key));
  const [key, entry] = found.find(([, e]) => e.books!.length >= 2) ?? found[0];
  return [key, entry.books!];
}

// Names from the design doc: the "Add book" link on /books, a dialog titled "Add book", "Look up", "Use <title>".
const addLink = (page: Page) => page.getByRole("main").getByRole("link", { name: "Add book", exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Add book" });

test("on a computer Add book opens a dialog over the list", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f092-a-${stamp()}@example.com`);
  await addAndOpenBook(page, "Alpha", "Want to read");
  await page.goto("/books");
  await addLink(page).click();
  await expect(sheet(page)).toBeVisible();
  await expect(page).toHaveURL(/\/books\?add=1/);
  const box = (await sheet(page).boundingBox())!;
  // Centered, and not stuck to the bottom edge.
  expect(box.y + box.height).toBeLessThan(DESKTOP.height - 20);
  expect(box.y).toBeGreaterThan(0);
  expect(Math.abs(box.x + box.width / 2 - DESKTOP.width / 2)).toBeLessThan(20);
  // The list is still behind it.
  await expect(page.getByRole("heading", { name: "My books" }).or(page.getByText("Alpha")).first())
    .toBeAttached();
  await expectAccessible(page);
});

test("on a phone Add book opens a sheet from the bottom", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signUpAs(page, `f092-b-${stamp()}@example.com`);
  await addAndOpenBook(page, "Alpha", "Want to read");
  await page.goto("/books");
  await addLink(page).click();
  await expect(sheet(page)).toBeVisible();
  const box = (await sheet(page).boundingBox())!;
  expect(Math.abs(box.y + box.height - PHONE.height)).toBeLessThan(4);
  expect(box.width).toBeGreaterThan(PHONE.width - 4);
  expect(box.height).toBeLessThanOrEqual(PHONE.height * 0.9 + 1);
  await expectAccessible(page);
});

test("/books/new still works as its own page", async ({ page }) => {
  await signUpAs(page, `f092-c-${stamp()}@example.com`);
  await page.goto("/books/new");
  const title = `Page book ${stamp()}`;
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByLabel("Title").fill(title);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^(Save|Add book)$/ }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
});

test("looking up a title shows matches with covers and picking one fills the form", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f092-d-${stamp()}@example.com`);
  await page.goto("/books?add=1");
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  const [key, books] = titleEntry();
  await dialog.getByRole("textbox", { name: "Look up" }).fill(key);
  await dialog.getByRole("button", { name: "Look up", exact: true }).click();
  for (const b of books) await expect(dialog.getByRole("button", { name: `Use ${b.title}` })).toBeVisible();
  // Each match shows a cover (or the placeholder): an image, or the cover's own labelled stand-in.
  await expect(dialog.getByRole("button", { name: `Use ${books[0].title}` }).getByRole("img").first()).toBeVisible();
  const pickIndex = books.length - 1;
  const chosen = books[pickIndex];
  await dialog.getByRole("button", { name: `Use ${chosen.title}` }).click();
  await expect(dialog.getByLabel("Title")).toHaveValue(chosen.title);
  await expect(dialog.getByLabel("Author")).toHaveValue(chosen.author);
  if (chosen.totalPages !== null) await expect(dialog.getByLabel("Total pages")).toHaveValue(String(chosen.totalPages));
});

test("after saving, the sheet closes and the new book is at the top of the list", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f092-e-${stamp()}@example.com`);
  await addAndOpenBook(page, "Alpha", "Want to read");
  await page.goto("/books");
  await addLink(page).click();
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  const title = `Sheet book ${stamp()}`;
  await dialog.getByLabel("Author").fill("George Eliot");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Add book", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/books$/);
  const items = page.getByRole("main").getByRole("listitem");
  await expect(items.first()).toContainText(title);
  await expect(items.nth(1)).toContainText("Alpha");
  await page.mouse.move(0, 0);
  await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  // Titles carry a per-run suffix: mask each list cell (its size does not change with the text).
  await expectScreens(page, "F092-add-sheet-saved", { mask: [items.first()] });
});
