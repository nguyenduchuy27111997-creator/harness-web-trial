import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { setFinishedOn } from "./reads";

// F059: /stats shows a "Finished by month" chart. Fresh account and books per test.
const year = new Date().getUTCFullYear();
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function finishedOn(page: Page, title: string, iso: string) {
  await addAndOpenBook(page, title, "Finished");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await setFinishedOn(page, iso);
}

// Each month's short name and count are read as text, e.g. "Mar 2".
async function expectCounts(page: Page, counts: Record<string, number>) {
  const chart = page.getByRole("region", { name: "Finished by month" });
  await expect(chart.getByRole("heading", { name: "Finished by month" })).toBeVisible();
  await expect(chart.getByRole("listitem")).toHaveCount(12);
  for (const m of months) {
    await expect(chart.getByRole("listitem").filter({ hasText: m })).toHaveText(new RegExp(`^${m}\\s*${counts[m] ?? 0}$`));
  }
}

test("two books finished on the 3rd and 20th of March show 2 in March, 0 elsewhere", async ({ page }) => {
  test.setTimeout(120_000); // long journey on a dev server
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f059a-${tag}@example.com`);
  await finishedOn(page, `Middlemarch ${tag}`, `${year}-03-03`);
  await finishedOn(page, `Persuasion ${tag}`, `${year}-03-20`);

  await page.goto("/stats");
  await expectCounts(page, { Mar: 2 });
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F059-monthly-chart.png", { stylePath: "e2e/hide-dev-overlay.css" });
});

test("a book finished last year is not counted in any month", async ({ page }) => {
  test.setTimeout(120_000); // long journey on a dev server
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f059b-${tag}@example.com`);
  await finishedOn(page, `Emma ${tag}`, `${year - 1}-03-15`);
  await finishedOn(page, `Villette ${tag}`, `${year}-03-10`);

  await page.goto("/stats");
  await expectCounts(page, { Mar: 1 });
});

test("with no books finished this year every month shows 0", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f059c-${tag}@example.com`);

  await page.goto("/stats");
  await expectCounts(page, {});
  await expectAccessible(page);
});
