import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { setFinishDate } from "./finish-dates";

// F059: /stats "Finished by month" chart. Fresh account and books per test (golden principle 7).
// The design names no container role, so the chart is the heading's parent.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const year = new Date().getUTCFullYear();

async function finishedBook(page: Page, title: string, iso: string) {
  await addAndOpenBook(page, title, "Finished");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await setFinishDate(page, iso);
}

async function expectMonths(page: Page, counts: Record<string, number>) {
  await page.goto("/stats");
  const heading = page.getByRole("heading", { name: "Finished by month" });
  await expect(heading).toBeVisible();
  const items = heading.locator("xpath=..").getByRole("listitem");
  await expect(items).toHaveCount(12);
  for (const [i, m] of MONTHS.entries()) {
    await expect(items.nth(i)).toHaveText(new RegExp(`^\\s*${m}\\s*${counts[m] ?? 0}\\s*$`));
  }
}

test("two books finished on 3 and 20 March show 2 in March and 0 elsewhere", async ({ page }) => {
  test.setTimeout(120_000);
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f059a-${tag}@example.com`);
  await finishedBook(page, `Middlemarch ${tag}`, `${year}-03-03`);
  await finishedBook(page, `Persuasion ${tag}`, `${year}-03-20`);
  await expectMonths(page, { Mar: 2 });
  await expectAccessible(page);
});

test("a book finished last year is not counted in any month", async ({ page }) => {
  test.setTimeout(120_000);
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f059b-${tag}@example.com`);
  await finishedBook(page, `Emma ${tag}`, `${year - 1}-06-15`);
  await expectMonths(page, {});
});

test("with no books finished this year every month shows 0", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f059c-${tag}@example.com`);
  await expectMonths(page, {});
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F059-monthly-chart.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
