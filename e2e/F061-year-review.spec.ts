import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addBookWithStatus, finishAndRateBook, setReadDates } from "./reads";

// F061: /stats/<year> lists the reads finished that year. Fresh account and books per test.
// Dates are Jan 1 and Jan 2 of this year, with the start date set too, so they are valid whatever day the test runs.
const year = new Date().getUTCFullYear();

test("/stats has a Year in review link to this year's review", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f061a-${tag}@example.com`);

  await page.goto("/stats");
  const link = page.getByRole("link", { name: "Year in review" });
  await expect(link).toBeVisible();
  await expectAccessible(page);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/stats/${year}$`));
  await expect(page.getByRole("heading", { name: `${year} in review` })).toBeVisible();
  await expect(page.getByText(`You finished no books in ${year}.`)).toBeVisible();
});

test("the review counts the year's finished reads, newest first, a book read twice once per read", async ({ page }) => {
  test.setTimeout(180_000); // long journey on a dev server
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const twice = `Middlemarch ${tag}`;
  const lastYear = `Emma ${tag}`;
  await signUpAs(page, `f061b-${tag}@example.com`);

  // Read twice this year: 4 stars finished Jan 1, then again 2 stars finished Jan 2.
  await addBookWithStatus(page, twice, "Reading");
  await finishAndRateBook(page, 4);
  await setReadDates(page, `${year}-01-01`, `${year}-01-01`);
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(page.getByRole("heading", { name: "Past reads" })).toBeVisible();
  await finishAndRateBook(page, 2);
  await setReadDates(page, `${year}-01-02`, `${year}-01-02`);

  // Finished last year: not in this year's review.
  await addBookWithStatus(page, lastYear, "Reading");
  await finishAndRateBook(page, 5);
  await setReadDates(page, `${year - 1}-12-30`, `${year - 1}-12-31`);

  await page.goto(`/stats/${year}`);
  await expect(page.getByRole("heading", { name: `${year} in review` })).toBeVisible();
  await expect(page.getByText(`You finished 2 books in ${year}.`)).toBeVisible();
  const rows = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: twice }) });
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole("link", { name: lastYear })).toHaveCount(0);
  // Newest finished first. The stars text ("2 stars") is the plainest reading of "its rating".
  await expect(rows.nth(0)).toContainText(`January 2, ${year}`);
  await expect(rows.nth(0)).toContainText(/2 stars/);
  await expect(rows.nth(1)).toContainText(`January 1, ${year}`);
  await expect(rows.nth(1)).toContainText(/4 stars/);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F061-year-review.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByRole("list").filter({ has: rows.first() })],
  });

  await rows.first().getByRole("link", { name: twice }).click();
  await expect(page.getByRole("heading", { name: twice })).toBeVisible();
});

test("a year with nothing finished says so; a non-year or a future year is not found", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f061c-${tag}@example.com`);

  await page.goto("/stats/2020");
  await expect(page.getByRole("heading", { name: "2020 in review" })).toBeVisible();
  await expect(page.getByText("You finished no books in 2020.")).toBeVisible();
  await expectAccessible(page);

  for (const path of ["/stats/abc", `/stats/${year + 1}`]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to stats" })).toBeVisible();
    await expectAccessible(page);
  }
});
