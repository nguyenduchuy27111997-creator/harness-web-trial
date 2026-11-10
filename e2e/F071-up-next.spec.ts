import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook, saveStatus } from "./books";

// F071: the Up next queue. Each test has its own account and uniquely named books.
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

async function queueNew(page: Page, title: string) {
  await addAndOpenBook(page, title, "Want to read");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Add to Up next" }).click();
  await expect(page.getByRole("button", { name: "Add to Up next" })).toBeHidden();
}

async function titles(page: Page) {
  return page.getByRole("main").getByRole("listitem").filter({ has: page.getByRole("button", { name: "Remove" }) }).getByRole("link").allTextContents();
}

test("Add to Up next only on Want to read books, and leaving Want to read leaves the queue", async ({ page }) => {
  const t = stamp();
  await signUpAs(page, `f071a-${t}@example.com`);
  const title = `Queue Status ${t}`;
  await addAndOpenBook(page, title, "Want to read");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Add to Up next" }).click();
  await expect(page.getByText("In Up next")).toBeVisible();

  await page.getByRole("link", { name: "Up next" }).click();
  await expect(page).toHaveURL(/\/up-next$/);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.getByRole("link", { name: title }).click();
  await saveStatus(page, "Reading");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByRole("button", { name: "Add to Up next" })).toHaveCount(0);

  await page.goto("/up-next");
  await expect(page.getByRole("heading", { name: "Up next" })).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  const finished = `Queue Finished ${t}`;
  await addAndOpenBook(page, finished, "Finished");
  await expect(page.getByRole("heading", { name: finished })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Up next" })).toHaveCount(0);
});

test("queue order: new books go last, move up and down, kept after reload", async ({ page }) => {
  const t = stamp();
  await signUpAs(page, `f071b-${t}@example.com`);
  const [a, b, c] = ["A", "B", "C"].map((n) => `Queue ${n} ${t}`);
  for (const title of [a, b, c]) await queueNew(page, title);

  await page.getByRole("link", { name: "Up next" }).click();
  await expect(page).toHaveURL(/\/up-next$/);
  await expect(page.getByRole("link", { name: c })).toBeVisible();
  expect(await titles(page)).toEqual([a, b, c]);

  const row = (title: string) => page.getByRole("listitem").filter({ hasText: title });
  await expect(row(a).getByRole("button", { name: "Move up" })).toHaveCount(0);
  await expect(row(a).getByRole("button", { name: "Move down" })).toBeVisible();
  await expect(row(c).getByRole("button", { name: "Move down" })).toHaveCount(0);
  await expect(row(c).getByRole("button", { name: "Move up" })).toBeVisible();

  await row(c).getByRole("button", { name: "Move up" }).click();
  await expect.poll(() => titles(page)).toEqual([a, c, b]);
  await row(a).getByRole("button", { name: "Move down" }).click();
  await expect.poll(() => titles(page)).toEqual([c, a, b]);

  await page.reload();
  await expect(page.getByRole("link", { name: b })).toBeVisible();
  expect(await titles(page)).toEqual([c, a, b]);

  await row(a).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("link", { name: a })).toHaveCount(0);
  expect(await titles(page)).toEqual([c, b]);

  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F071-up-next.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByRole("main").getByRole("listitem")],
  });
});
