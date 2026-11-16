import { expect, test, type Page } from "@playwright/test";
import { expectScreens } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { coverFile, submitCover } from "./covers";

const lane = process.env.HARNESS_LANE ?? "local";

// Fresh account, one book with a cover; returns the title. The book page is open on return.
async function bookWithCover(page: Page, id: string, status: string) {
  const stamp = `${lane}-${Date.now()}`;
  const title = `Layout ${id} ${stamp}`;
  await signUpAs(page, `f091-${id}-${stamp}@example.com`);
  await addAndOpenBook(page, title, status);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await submitCover(page, coverFile("image/png"), "Add cover");
  await expect(page.getByRole("img", { name: `Cover of ${title}` })).toBeVisible();
  return title;
}

async function boxes(page: Page, title: string) {
  const cover = await page.getByRole("img", { name: `Cover of ${title}` }).first().boundingBox();
  const heading = await page.getByRole("heading", { level: 1, name: title }).boundingBox();
  const author = await page.getByText("George Eliot", { exact: true }).first().boundingBox();
  expect(cover).not.toBeNull();
  expect(heading).not.toBeNull();
  expect(author).not.toBeNull();
  return { cover: cover!, heading: heading!, author: author! };
}

test("on a computer the large cover sits beside the title and author", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const title = await bookWithCover(page, "wide", "Reading");
  const { cover, heading, author } = await boxes(page, title);
  expect(cover.width).toBeGreaterThanOrEqual(100);
  expect(cover.x + cover.width).toBeLessThanOrEqual(heading.x + 1);
  expect(cover.x + cover.width).toBeLessThanOrEqual(author.x + 1);
  expect(heading.y).toBeLessThan(cover.y + cover.height);
});

test("on a phone the cover is above the title and author", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const title = await bookWithCover(page, "phone", "Reading");
  const { cover, heading, author } = await boxes(page, title);
  expect(cover.y + cover.height).toBeLessThanOrEqual(heading.y + 1);
  expect(cover.y + cover.height).toBeLessThanOrEqual(author.y + 1);
});

test("status segments save on pick, progress is a bar, and sections follow in order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const title = await bookWithCover(page, "order", "Reading");

  const status = page.getByRole("radiogroup", { name: "Status" });
  await expect(status.getByRole("radio")).toHaveCount(3);
  await expect(status.getByRole("radio", { name: "Reading" })).toBeChecked();

  await page.getByLabel("Total pages").fill("300");
  await page.getByLabel("Current page").fill("120");
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText("120 of 300 pages")).toBeVisible();
  await expect(page.getByRole("progressbar")).toBeVisible();

  await status.getByRole("radio", { name: "Finished" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Status" }).getByRole("radio", { name: "Finished" })).toBeChecked();

  const ys: number[] = [];
  for (const name of ["Rating", "Review", "Notes", "Quotes"]) {
    const h = page.getByRole("heading", { name, exact: true });
    await expect(h).toBeVisible();
    ys.push((await h.boundingBox())!.y);
  }
  expect(ys).toEqual([...ys].sort((a, b) => a - b));

  // Delete is the last control on the page.
  const del = page.getByRole("button", { name: "Delete book" });
  await expect(del).toBeVisible();
  const delY = (await del.boundingBox())!.y;
  expect(delY).toBeGreaterThan(ys[3] ?? 0);
  const lowest = await page.getByRole("button").evaluateAll((els) =>
    Math.max(...els.map((e) => e.getBoundingClientRect().top + window.scrollY)));
  expect(delY + (await page.evaluate(() => window.scrollY))).toBeGreaterThanOrEqual(lowest - 1);

  await expectScreens(page, "F091-book-page", {
    fullPage: true,
    mask: [page.getByRole("heading", { level: 1, name: title }).locator("xpath=..")],
  });
});

test("Delete is red and asks to confirm, naming the book", async ({ page }) => {
  const title = await bookWithCover(page, "delete", "Reading");
  const del = page.getByRole("button", { name: "Delete book" });
  await expect(del).toBeVisible();
  const isRed = (css: string) => {
    const [r = 0, g = 0, b = 0] = (css.match(/[\d.]+/g) ?? []).map(Number);
    return r > g && r > b;
  };
  const [fill, text] = await del.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  // Red either as the fill or as the text (a tinted destructive button).
  expect(isRed(fill ?? "") || isRed(text ?? "")).toBe(true);

  const dialog = page.getByRole("alertdialog");
  await del.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: `Delete ${title}?` })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  await del.click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});
