import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { coverFile, submitCover } from "./covers";
import { createShelves, shelveOpenBook } from "./shelves";

const lane = process.env.HARNESS_LANE ?? "local";
const shelfRow = (page: Page, name: string) => page.getByRole("listitem").filter({ hasText: name });
const linkText = (page: Page, name: string) => shelfRow(page, name).getByText(/\/s\/[0-9a-f]{48}/);

// A fresh account with a shelf holding one finished, rated book with a cover. Returns the names.
async function sharedShelfSetup(page: Page, id: string) {
  const stamp = `${lane}-${Date.now()}`;
  await signUpAs(page, `f083-${id}-${stamp}@example.com`);
  const shelf = `Club ${id} ${stamp}`;
  const title = `Shared ${id} ${stamp}`;
  await createShelves(page, [shelf]);
  await addAndOpenBook(page, title, "Finished");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await page.getByRole("radiogroup", { name: "Rating" }).getByRole("radio", { name: "4 stars" }).click();
  await page.getByRole("button", { name: "Rate" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  // Button name 'Add cover' comes from F081's acceptance.
  await submitCover(page, coverFile("image/png"), "Add cover");
  await expect(page.getByRole("img", { name: `Cover of ${title}` })).toBeVisible();
  await shelveOpenBook(page, shelf);
  await page.goto("/shelves");
  return { shelf, title };
}

// Shares the shelf and returns the link's address.
async function share(page: Page, shelf: string) {
  await shelfRow(page, shelf).getByRole("button", { name: "Share" }).click();
  await expect(shelfRow(page, shelf).getByRole("button", { name: "Copy link" })).toBeVisible();
  const text = (await linkText(page, shelf).textContent()) ?? "";
  const match = text.match(/(\S*\/s\/[0-9a-f]{48})/);
  expect(match).not.toBeNull();
  return match![1];
}

// Opens `url` in a fresh browser context with no session.
async function visitSignedOut(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  return { page, context };
}

test("Share makes a /s/<token> link with Copy link; a signed-out visitor reads the shelf read-only", async ({ page, browser }) => {
  const { shelf, title } = await sharedShelfSetup(page, "view");
  await expect(shelfRow(page, shelf).getByRole("button", { name: "Share" })).toBeVisible();
  await expect(shelfRow(page, shelf).getByRole("button", { name: "Copy link" })).toHaveCount(0);
  const url = await share(page, shelf);
  expect(url).toMatch(/\/s\/[0-9a-f]{48}$/);
  await expectAccessible(page);

  const { page: anon, context } = await visitSignedOut(browser, url);
  await expect(anon.getByRole("heading", { level: 1, name: shelf })).toBeVisible();
  const book = anon.getByRole("listitem").filter({ hasText: title });
  await expect(book).toBeVisible();
  await expect(book).toContainText("George Eliot");
  await expect(book).toContainText("Finished");
  await expect(book).toContainText(/\b4\b/);
  await expect(book.getByRole("img", { name: `Cover of ${title}` })).toBeVisible();

  // Read-only: no link to a book page, no form controls, no header links to anyone's pages.
  await expect(anon.locator('a[href^="/books"]')).toHaveCount(0);
  await expect(anon.getByRole("button")).toHaveCount(0);
  await expect(anon.getByRole("textbox")).toHaveCount(0);
  await expect(anon.getByRole("link", { name: /^(Books|Stats|Shelves|Tags|Quotes|Up next)$/ })).toHaveCount(0);

  await expectAccessible(anon);
  await expect(anon).toHaveScreenshot("F083-shared-shelf.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [anon.getByRole("heading", { level: 1 }), anon.getByRole("listitem")],
  });
  await context.close();
});

test("Stop sharing makes the old link not found; sharing again makes a new token", async ({ page, browser }) => {
  const { shelf } = await sharedShelfSetup(page, "stop");
  const first = await share(page, shelf);

  await shelfRow(page, shelf).getByRole("button", { name: "Stop sharing" }).click();
  await expect(shelfRow(page, shelf).getByRole("button", { name: "Share" })).toBeVisible();
  await expect(shelfRow(page, shelf).getByRole("button", { name: "Stop sharing" })).toHaveCount(0);

  const old = await visitSignedOut(browser, first);
  await expect(old.page.getByRole("heading", { name: shelf })).toHaveCount(0);
  await expect(old.page.getByText(/not found|404/i).first()).toBeVisible();
  await expectAccessible(old.page);
  await old.context.close();

  const second = await share(page, shelf);
  expect(second).not.toBe(first);
  const fresh = await visitSignedOut(browser, second);
  await expect(fresh.page.getByRole("heading", { level: 1, name: shelf })).toBeVisible();
  await fresh.context.close();
  const again = await visitSignedOut(browser, first);
  await expect(again.page.getByText(/not found|404/i).first()).toBeVisible();
  await again.context.close();
});

test("a made-up token is not found", async ({ browser }) => {
  const { page, context } = await visitSignedOut(browser, `/s/${"0".repeat(48)}`);
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
  await context.close();
});
