import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addBookWithStatus, finishAndRateBook, setReadDates } from "./reads";

// F062: average and highest rated on /stats/<year>, and links to the previous and next year.
// Fresh account and books per test.
const year = new Date().getUTCFullYear();

test("rated 5, 5 and 3 this year: average 4.3 and the two 5-star books under Highest rated", async ({ page }) => {
  test.setTimeout(180_000); // long journey on a dev server
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const titles = [`Five A ${tag}`, `Five B ${tag}`, `Three ${tag}`];
  await signUpAs(page, `f062a-${tag}@example.com`);
  for (const [i, stars] of [5, 5, 3].entries()) {
    await addBookWithStatus(page, titles[i], "Reading");
    await finishAndRateBook(page, stars);
  }

  await page.goto(`/stats/${year}`);
  await expect(page.getByRole("heading", { name: `${year} in review` })).toBeVisible();
  await expect(page.getByText("Average rating: 4.3")).toBeVisible();
  const heading = page.getByRole("heading", { name: "Highest rated" });
  await expect(heading).toBeVisible();
  const highest = heading.locator("xpath=..").getByRole("listitem");
  await expect(highest).toHaveCount(2);
  await expect(highest.filter({ has: page.getByRole("link", { name: titles[0] }) })).toHaveCount(1);
  await expect(highest.filter({ has: page.getByRole("link", { name: titles[1] }) })).toHaveCount(1);
  await expect(highest.filter({ has: page.getByRole("link", { name: titles[2] }) })).toHaveCount(0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F062-year-review-highlights.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByRole("listitem"), page.getByText(/Average rating/)],
  });
});

test("a year with no rated books shows no average and no Highest rated list", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f062b-${tag}@example.com`);

  await page.goto(`/stats/${year}`);
  await expect(page.getByRole("heading", { name: `${year} in review` })).toBeVisible();
  await expect(page.getByText(/Average rating/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Highest rated" })).toHaveCount(0);
  await expectAccessible(page);
});

test("a book finished last year: Previous year link to that year, which lists it and links Next year back", async ({ page }) => {
  test.setTimeout(180_000);
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const title = `Emma ${tag}`;
  await signUpAs(page, `f062c-${tag}@example.com`);
  await addBookWithStatus(page, title, "Reading");
  await finishAndRateBook(page, 4);
  await setReadDates(page, `${year - 1}-12-30`, `${year - 1}-12-31`);

  await page.goto(`/stats/${year}`);
  await expect(page.getByRole("heading", { name: `${year} in review` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next year" })).toHaveCount(0);
  await page.getByRole("link", { name: "Previous year" }).click();
  await expect(page).toHaveURL(new RegExp(`/stats/${year - 1}$`));
  await expect(page.getByRole("heading", { name: `${year - 1} in review` })).toBeVisible();
  await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: "Next year" }).click();
  await expect(page).toHaveURL(new RegExp(`/stats/${year}$`));
  await expect(page.getByRole("heading", { name: `${year} in review` })).toBeVisible();
});
