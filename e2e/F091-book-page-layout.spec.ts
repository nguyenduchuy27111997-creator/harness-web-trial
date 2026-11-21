import { expect, test, type Page } from "@playwright/test";
import { expectScreens } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { setTotalPages } from "./reads";

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// The cover is drawn as a placeholder box (no upload); the app marks it with a test id.
const cover = (page: Page) => page.getByRole("main").getByTestId("cover-placeholder");

// Acceptance 1, computer: the cover beside the title and author.
test("on a computer the cover sits beside the title and author", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f091-a-${stamp()}@example.com`);
  await addAndOpenBook(page, "Middlemarch", "Reading");
  const title = page.getByRole("heading", { level: 1, name: "Middlemarch" });
  await expect(title).toBeVisible();
  const [c, t, a] = await Promise.all([
    cover(page).boundingBox(),
    title.boundingBox(),
    page.getByRole("main").getByText("George Eliot", { exact: true }).boundingBox(),
  ]);
  // Cover on the left, same band as the title, title and author to its right.
  expect(t!.x).toBeGreaterThan(c!.x + c!.width - 1);
  expect(a!.x).toBeGreaterThan(c!.x + c!.width - 1);
  expect(t!.y).toBeLessThan(c!.y + c!.height);
  expect(c!.height).toBeGreaterThan(c!.width);
});

// Acceptance 1, phone: the cover above them.
test("on a phone the cover sits above the title and author", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signUpAs(page, `f091-b-${stamp()}@example.com`);
  await addAndOpenBook(page, "Middlemarch", "Reading");
  const title = page.getByRole("heading", { level: 1, name: "Middlemarch" });
  await expect(title).toBeVisible();
  const [c, t, a] = await Promise.all([
    cover(page).boundingBox(),
    title.boundingBox(),
    page.getByRole("main").getByText("George Eliot", { exact: true }).boundingBox(),
  ]);
  expect(t!.y).toBeGreaterThanOrEqual(c!.y + c!.height - 1);
  expect(a!.y).toBeGreaterThan(t!.y);
});

// Acceptance 2, first half: status is a segmented control that saves on pick; progress is a bar with pages read.
test("status is a segmented control and progress shows pages read of the total", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f091-c-${stamp()}@example.com`);
  await addAndOpenBook(page, "Middlemarch", "Reading");
  await expect(page.getByRole("heading", { level: 1, name: "Middlemarch" })).toBeVisible();

  const status = page.getByRole("radiogroup", { name: "Status" });
  await expect(status.getByRole("radio")).toHaveCount(3);
  await expect(status.getByRole("radio", { name: "Reading" })).toBeChecked();
  // No Save button: picking a segment saves at once.
  await expect(page.getByRole("button", { name: "Save status" })).toHaveCount(0);

  await setTotalPages(page, "300");
  await expect(page.getByRole("main").getByText("1 of 300 pages")).toBeVisible();
  await expect(page.getByRole("main").getByRole("progressbar")).toBeVisible();

  await status.getByRole("radio", { name: "Finished" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Status" }).getByRole("radio", { name: "Finished" })).toBeChecked();
  await expect(page.getByRole("heading", { level: 1, name: "Middlemarch" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expectScreens(page, "F091-book-page-finished");
});

// Acceptance 2 (order) and 3: rating, review, notes, quotes, then Delete last, in red, naming the book.
test("rating, review, notes and quotes follow in order, and Delete is last, red and names the book", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f091-d-${stamp()}@example.com`);
  await addAndOpenBook(page, "Middlemarch", "Want to read");
  await expect(page.getByRole("heading", { level: 1, name: "Middlemarch" })).toBeVisible();
  await page.getByRole("radiogroup", { name: "Status" }).getByRole("radio", { name: "Finished" }).click();
  await expect(page.getByRole("heading", { name: "Rating" })).toBeVisible();

  const main = page.getByRole("main");
  const ys: number[] = [];
  for (const name of ["Rating", "Review", "Notes", "Quotes"]) {
    const box = await main.getByRole("heading", { name, exact: true }).boundingBox();
    expect(box, `${name} heading`).not.toBeNull();
    ys.push(box!.y);
  }
  expect(ys).toEqual([...ys].sort((x, y) => x - y));

  const del = main.getByRole("button", { name: "Delete book" });
  await expect(del).toBeVisible();
  const delBox = await del.boundingBox();
  const quotes = await main.getByRole("heading", { name: "Quotes", exact: true }).boundingBox();
  expect(delBox!.y).toBeGreaterThan(quotes!.y);
  // Delete is the last button in the main column, in red (the destructive token; computed colours
  // are serialised as lab(), so the class is what says red).
  const buttons = main.getByRole("button");
  await expect(buttons.last()).toHaveAccessibleName("Delete book");
  await expect(del).toHaveClass(/destructive/);

  await del.click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog.getByRole("heading", { name: "Delete Middlemarch?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Middlemarch" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expectScreens(page, "F091-book-page-sections");
});
