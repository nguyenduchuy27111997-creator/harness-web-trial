import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addQueuedBook } from "./books";

// F072: start reading the first book in Up next. Each test has its own account and books.
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
const today = () => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date());

test("Start reading moves the first book to Reading and the next book becomes first", async ({ page }) => {
  const t = stamp();
  await signUpAs(page, `f072a-${t}@example.com`);
  const [a, b] = ["A", "B"].map((n) => `Start ${n} ${t}`);
  await addQueuedBook(page, a);
  await addQueuedBook(page, b);

  await page.goto("/up-next");
  await expect(page.getByRole("link", { name: b })).toBeVisible();
  await expect(page.getByRole("button", { name: `Start reading ${a}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Start reading ${b}` })).toHaveCount(0);

  await page.getByRole("button", { name: `Start reading ${a}` }).click();
  await expect(page.getByRole("link", { name: a })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Start reading ${b}` })).toBeVisible();

  await page.getByRole("link", { name: b }).click();
  await expect(page.getByRole("heading", { name: b })).toBeVisible();
  await page.goBack();

  await page.goto("/books");
  await page.getByRole("link", { name: a }).click();
  await expect(page.getByRole("heading", { name: a })).toBeVisible();
  await expect(page.getByText(`Started on ${today()}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Up next" })).toHaveCount(0);
});

test("an empty queue says Nothing up next and links to Want to read", async ({ page }) => {
  const t = stamp();
  await signUpAs(page, `f072b-${t}@example.com`);
  const title = `Start Only ${t}`;
  await addQueuedBook(page, title);

  await page.goto("/up-next");
  await page.getByRole("button", { name: `Start reading ${title}` }).click();
  await expect(page.getByText("Nothing up next")).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F072-up-next-empty.png", {
    stylePath: "e2e/hide-dev-overlay.css",
  });

  await page.getByRole("main").getByRole("link", { name: "Want to read" }).click();
  await expect(page).toHaveURL(/status=want_to_read/);
});
