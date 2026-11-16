import { expect, test } from "@playwright/test";
import { expectScreens } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { setFinishedOn } from "./reads";

// F094: an empty year says so instead of showing tiles; a past year's review gets the tiles and chart.
const year = new Date().getUTCFullYear();
const tag = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

test("with nothing finished this year, /stats says so, links to my books and keeps the goal form", async ({ page }) => {
  await signUpAs(page, `f094c-${tag()}@example.com`);
  await page.goto("/stats");
  await expect(page.getByText(`No books finished in ${year}`)).toBeVisible();
  await expect(page.getByText("Pages read", { exact: true })).toHaveCount(0);
  // The chart stays with its 12 months at 0 and no extra line (decision 0027).
  await expect(page.getByText("Books you finish this year show up here.")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Finished by month" }).getByRole("listitem")).toHaveCount(12);
  await expect(page.getByRole("textbox", { name: "Set a reading goal for this year" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set goal" })).toBeVisible();
  await expectScreens(page, "F094-stats-empty-year", { mask: [page.getByText(String(year))] });
  await page.getByRole("link", { name: "Go to my books" }).click();
  await expect(page).toHaveURL(/\/books$/);
});

test("a past year's review shows its tiles and chart; an empty year says so", async ({ page }) => {
  test.setTimeout(120_000); // long journey on a dev server
  await signUpAs(page, `f094d-${tag()}@example.com`);
  await addAndOpenBook(page, "Middlemarch", "Finished");
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();
  await setFinishedOn(page, `${year - 1}-03-05`);

  await page.goto(`/stats/${year - 1}`);
  await expect(page.getByRole("heading", { name: `${year - 1} in review` })).toBeVisible();
  for (const label of ["Books finished", "Pages read", "Average rating"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  const chart = page.getByRole("region", { name: "Finished by month" });
  await expect(chart.getByRole("listitem").filter({ hasText: "Mar" })).toHaveText(/^Mar\s*1$/);

  await page.goto(`/stats/${year - 2}`);
  await expect(page.getByText(`No books finished in ${year - 2}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Finished by month" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Go to my books" })).toBeVisible();
  await expectScreens(page, "F094-stats-past-year-empty", { mask: [page.getByText(/\d{4}/)] });
});
