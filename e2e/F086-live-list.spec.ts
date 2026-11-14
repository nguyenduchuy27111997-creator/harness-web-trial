import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { saveStatus } from "./books";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
const LIVE = { timeout: 5_000 }; // acceptance: within 5 seconds, no reload

async function addBook(page: Page, title: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Live Author");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/books$/);
}

// F086: /books in a second tab follows changes made in the first. Fresh account per test (golden principle 7).
test("add, status change and delete show in another tab without a reload", async ({ page, context }) => {
  const s = stamp();
  await signUpAs(page, `f086-a-${s}@example.com`);
  const title = `Live Book ${s}`;
  const other = await context.newPage();
  await other.goto("/books");
  await expect(other.getByRole("navigation", { name: "Book filter" })).toBeVisible();
  await expect(other.getByRole("link", { name: title })).toHaveCount(0);

  // Add in the first tab.
  await addBook(page, title);
  await expect(other.getByRole("link", { name: title })).toBeVisible(LIVE);

  // Status change: the other tab's Reading tab count follows.
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await saveStatus(page, "Reading");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(other.getByRole("link", { name: "Reading (1)", exact: true })).toBeVisible(LIVE);

  await expect(other.getByRole("link", { name: title })).toBeVisible();
  await expectAccessible(other);
  await expect(other).toHaveScreenshot("F086-live-list.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [other.getByRole("main")],
  });

  // Delete in the first tab.
  const dialog = page.getByRole("alertdialog");
  await page.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/books$/);
  await expect(other.getByRole("link", { name: title })).toHaveCount(0, LIVE);
});

test("a second account's changes never reach my tab", async ({ page, browser, baseURL }) => {
  const s = stamp();
  await signUpAs(page, `f086-b-${s}@example.com`);
  await page.goto("/books");
  await expect(page.getByRole("navigation", { name: "Book filter" })).toBeVisible();

  const ctxB = await browser.newContext({ baseURL });
  const pageB = await ctxB.newPage();
  await signUpAs(pageB, `f086-c-${s}@example.com`);
  const theirs = `Other Account Book ${s}`;
  const mine = `My Own Book ${s}`;
  await addBook(pageB, theirs);

  // My own change arrives (so the tab is live); the other account's book never does.
  const mineTab = await page.context().newPage();
  await mineTab.goto("/books");
  await addBook(mineTab, mine);
  await expect(page.getByRole("link", { name: mine })).toBeVisible(LIVE);
  await expect(page.getByRole("link", { name: theirs })).toHaveCount(0);

  await ctxB.close();
});

test("after the connection drops and comes back the list catches up", async ({ page, context }) => {
  const s = stamp();
  await signUpAs(page, `f086-d-${s}@example.com`);
  const adder = await context.newPage();
  await page.goto("/books");
  await expect(page.getByRole("navigation", { name: "Book filter" })).toBeVisible();

  await context.setOffline(true);
  await page.waitForTimeout(1_000);
  await context.setOffline(false);
  const title = `Catch Up Book ${s}`;
  await addBook(adder, title);
  await expect(page.getByRole("link", { name: title })).toBeVisible({ timeout: 15_000 });
});
