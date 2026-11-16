import { expect, test, type Page } from "@playwright/test";
import { expectScreens } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { setFinishedOn } from "./reads";

// F094: /stats as a year in review: tiles, accent bars, a goal ring, two tiles per row on a phone.
// Fresh account per test; titles are constant because the account is new each time.
const year = new Date().getUTCFullYear();

async function accountWithFinishedBook(page: Page, prefix: string) {
  await signUpAs(page, `${prefix}-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await addAndOpenBook(page, "Middlemarch", "Finished");
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();
  await setFinishedOn(page, `${year}-01-05`);
}

// The design doc gives the tile's label, not its container: the label's parent is the tile.
const tile = (page: Page, label: string) => page.getByText(label, { exact: true }).first().locator("xpath=..");

test("tiles line up in a row, the ring shows the goal, and the months are accent bars", async ({ page }) => {
  test.setTimeout(120_000); // long journey on a dev server
  await page.setViewportSize({ width: 1280, height: 900 });
  await accountWithFinishedBook(page, "f094a");

  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "Stats" }).first()).toBeVisible();
  await page.getByLabel("Reading goal").fill("10");
  await page.getByRole("button", { name: "Set goal" }).click();
  await expect(page.getByText("1 of 10 books finished this year")).toBeVisible();

  const boxes = [];
  for (const label of ["Books finished", "Pages read", "Average rating"]) {
    await expect(tile(page, label)).toBeVisible();
    const box = await tile(page, label).boundingBox();
    expect(box).not.toBeNull();
    boxes.push(box!);
  }
  // One row on a desktop: same top, same height, side by side.
  expect(Math.abs(boxes[1].y - boxes[0].y)).toBeLessThan(2);
  expect(Math.abs(boxes[2].y - boxes[0].y)).toBeLessThan(2);
  expect(Math.abs(boxes[1].height - boxes[0].height)).toBeLessThan(2);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width - 2);
  expect(boxes[2].x).toBeGreaterThan(boxes[1].x + boxes[1].width - 2);

  // The ring is a visible graphic (scoped to the ring: the nav icons come first in the DOM).
  const ring = page.getByRole("progressbar", { name: "Reading goal progress" });
  await expect(ring).toBeVisible();
  await expect(ring).toHaveAttribute("aria-valuenow", "10");

  // March-like month with a book: January's bar is drawn in a non-transparent color, other months are empty.
  const chart = page.getByRole("region", { name: "Finished by month" });
  await expect(chart.getByRole("listitem")).toHaveCount(12);
  const painted = await chart.getByRole("listitem").filter({ hasText: "Jan" }).evaluate((li) => {
    const transparent = "rgba(0, 0, 0, 0)";
    return [li, ...Array.from(li.querySelectorAll("*"))].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).backgroundColor !== transparent;
    });
  });
  expect(painted).toBe(true);

  await expectScreens(page, "F094-stats-layout", { mask: [page.getByText(String(year))] });
});

test("on a phone the tiles sit two per row and the chart fits the width", async ({ page }) => {
  test.setTimeout(120_000); // long journey on a dev server
  await accountWithFinishedBook(page, "f094b");
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/stats");
  const boxes = [];
  for (const label of ["Books finished", "Pages read", "Average rating"]) {
    await expect(tile(page, label)).toBeVisible();
    const box = await tile(page, label).boundingBox();
    expect(box).not.toBeNull();
    boxes.push(box!);
  }
  expect(Math.abs(boxes[1].y - boxes[0].y)).toBeLessThan(2);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width - 2);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 2); // the third wraps

  const chart = page.getByRole("region", { name: "Finished by month" });
  await expect(chart.getByRole("listitem")).toHaveCount(12);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  const box = await chart.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
  // Twelve month rows stacked, one under the other.
  const first = await chart.getByRole("listitem").first().boundingBox();
  const last = await chart.getByRole("listitem").last().boundingBox();
  expect(last!.y).toBeGreaterThan(first!.y + first!.height - 2);

  await expectScreens(page, "F094-stats-layout-phone", { mask: [page.getByText(String(year))] });
});
