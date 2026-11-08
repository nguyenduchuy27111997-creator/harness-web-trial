import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { finishBook, setTotalPages } from "./reads";

// F060: /stats shows the pages read this year. Fresh account per test (golden principle 7).
const tag = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// Adds a Reading book, gives it total pages (if any) and finishes it.
async function finishedBook(page: Page, title: string, pages?: string) {
  await addAndOpenBook(page, title, "Reading");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  if (pages) await setTotalPages(page, pages);
  await finishBook(page);
}

test("pages of the books finished this year add up", async ({ page }) => {
  test.setTimeout(120_000);
  const t = tag();
  await signUpAs(page, `f060a-${t}@example.com`);
  await finishedBook(page, `Middlemarch ${t}`, "250");
  await finishedBook(page, `Persuasion ${t}`, "120");

  await page.goto("/stats");
  await expect(page.getByText("370 pages read this year")).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F060-pages-read.png", { stylePath: "e2e/hide-dev-overlay.css", mask: [page.getByRole("region", { name: "Finished by month" }).getByRole("list")] });
});

test("a book without total pages is not counted", async ({ page }) => {
  test.setTimeout(120_000);
  const t = tag();
  await signUpAs(page, `f060b-${t}@example.com`);
  await finishedBook(page, `Middlemarch ${t}`, "250");
  await finishedBook(page, `No Pages ${t}`);

  await page.goto("/stats");
  await expect(page.getByText("250 pages read this year")).toBeVisible();
});

test("reading the 250-page book again counts its pages again", async ({ page }) => {
  test.setTimeout(120_000);
  const t = tag();
  await signUpAs(page, `f060c-${t}@example.com`);
  await finishedBook(page, `Middlemarch ${t}`, "250");
  await finishedBook(page, `Persuasion ${t}`, "120");
  await page.goto("/books");
  await page.getByRole("link", { name: `Middlemarch ${t}` }).click();
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(page.getByRole("heading", { name: "Past reads" })).toBeVisible();
  await finishBook(page);

  await page.goto("/stats");
  await expect(page.getByText("620 pages read this year")).toBeVisible();
});

test("with nothing read this year, stats show 0 pages", async ({ page }) => {
  await signUpAs(page, `f060d-${tag()}@example.com`);
  await page.goto("/stats");
  await expect(page.getByText("0 pages read this year")).toBeVisible();
});
