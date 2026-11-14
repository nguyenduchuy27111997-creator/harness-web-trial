import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { coverFile, submitCover } from "./covers";

const lane = process.env.HARNESS_LANE ?? "local";

// Signs up a fresh account and adds a book with a cover and one without; both titles start with a
// distinct letter (Q and Z) so the placeholder's letter can be found. Returns the two titles.
async function shelfWithOneCover(page: Page, id: string) {
  const stamp = `${lane}-${Date.now()}`;
  await signUpAs(page, `f082-${id}-${stamp}@example.com`);
  const covered = `Quiet ${id} ${stamp}`;
  const bare = `Zebra ${id} ${stamp}`;
  await addAndOpenBook(page, covered, "Reading");
  await expect(page.getByRole("heading", { level: 1, name: covered })).toBeVisible();
  // Button name 'Add cover' comes from F081's acceptance.
  await submitCover(page, coverFile("image/png"), "Add cover");
  await expect(page.getByRole("img", { name: `Cover of ${covered}` })).toBeVisible();
  await page.goto("/books/new");
  await page.getByLabel("Author").fill("Some Author");
  await page.getByLabel("Title").fill(bare);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/books$/);
  return { covered, bare };
}

const row = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });

test("the list shows a thumbnail for a book with a cover and a first-letter placeholder for one without", async ({ page }) => {
  const { covered, bare } = await shelfWithOneCover(page, "list");
  await page.goto("/books");

  const thumb = row(page, covered).getByRole("img", { name: `Cover of ${covered}` });
  await expect(thumb).toBeVisible();
  await expect(row(page, bare).getByRole("img", { name: `Cover of ${bare}` })).toHaveCount(0);
  await expect(row(page, bare).getByText("Z", { exact: true })).toBeVisible();
  await expect(row(page, covered).getByText("Q", { exact: true })).toHaveCount(0);

  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F082-cover-display.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [
      page.getByRole("heading", { level: 1 }),
      page.getByRole("listitem").getByText(/Quiet |Zebra /),
      page.getByRole("listitem").getByText(/^(Some Author|George Eliot)$/),
    ],
  });
});

test("covers load through signed URLs, never public ones, in a fixed-size thumbnail", async ({ page }) => {
  const { covered, bare } = await shelfWithOneCover(page, "signed");
  await page.goto("/books");
  const thumb = row(page, covered).getByRole("img", { name: `Cover of ${covered}` });
  await expect(thumb).toBeVisible();

  const src = (await thumb.getAttribute("src")) ?? "";
  const decoded = decodeURIComponent(src);
  expect(decoded).toContain("/object/sign/covers/");
  expect(decoded).toContain("token=");
  expect(decoded).not.toContain("/object/public/");

  // No layout shift: the thumbnail and the placeholder have the same fixed size, before and after load.
  await expect.poll(() => thumb.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const loaded = await thumb.boundingBox();
  expect(loaded).not.toBeNull();
  expect(Math.round(loaded!.width)).toBe(40);
  expect(Math.round(loaded!.height)).toBe(60);
  const letter = await row(page, bare).getByText("Z", { exact: true }).boundingBox();
  expect(letter).not.toBeNull();
  const placeholder = await row(page, bare).getByText("Z", { exact: true }).locator("xpath=ancestor-or-self::*[1]").boundingBox();
  expect(placeholder!.width).toBeLessThanOrEqual(40);
  expect(placeholder!.height).toBeLessThanOrEqual(60);

  // The row does not move when the image arrives: hold the image back, measure, then let it through.
  await page.route("**/object/sign/covers/**", (route) => route.abort());
  await page.reload();
  const held = row(page, covered);
  await expect(held).toBeVisible();
  const before = await held.boundingBox();
  await page.unroute("**/object/sign/covers/**");
  await page.reload();
  await expect(row(page, covered).getByRole("img", { name: `Cover of ${covered}` })).toBeVisible();
  const after = await row(page, covered).boundingBox();
  expect(Math.round(after!.height)).toBe(Math.round(before!.height));
  await expectAccessible(page);
});
