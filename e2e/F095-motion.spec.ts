import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectAccessible, expectScreens } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook, saveStatus } from "./books";

const DESKTOP = { width: 1280, height: 800 };
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// Smallest scale and largest shift (px) of an element or any ancestor, read from its computed transform.
// Looks only at what the user sees, not at how the page animates.
function transformOf(target: Locator) {
  return target.evaluate((el) => {
    let minScale = 1;
    let maxShift = 0;
    for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
      const t = getComputedStyle(node).transform;
      if (!t || t === "none") continue;
      const m = new DOMMatrixReadOnly(t);
      minScale = Math.min(minScale, m.a, m.d);
      maxShift = Math.max(maxShift, Math.abs(m.e), Math.abs(m.f));
    }
    return { minScale, maxShift };
  });
}

// Starts recording, every frame, how far the list item with this text is shifted, scaled or faded.
async function recordItem(page: Page, text: string) {
  await page.evaluate((needle) => {
    const w = window as unknown as { __motion: { shift: number; scaleDelta: number; faded: boolean } };
    w.__motion = { shift: 0, scaleDelta: 0, faded: false };
    const tick = () => {
      for (const li of Array.from(document.querySelectorAll("main li"))) {
        if (!li.textContent?.includes(needle)) continue;
        for (let n: Element | null = li; n && n !== document.body; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (Number(cs.opacity) < 0.99) w.__motion.faded = true;
          if (cs.transform && cs.transform !== "none") {
            const m = new DOMMatrixReadOnly(cs.transform);
            w.__motion.shift = Math.max(w.__motion.shift, Math.abs(m.e), Math.abs(m.f));
            w.__motion.scaleDelta = Math.max(w.__motion.scaleDelta, Math.abs(1 - m.a), Math.abs(1 - m.d));
          }
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
  }, text);
}

const readMotion = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __motion: { shift: number; scaleDelta: number; faded: boolean } }).__motion,
  );

// Adds a book from the sheet over /books, with a book already listed so the list has somewhere to slide.
// Returns once the new book is in the list; the recording started before the save.
async function addFromSheet(page: Page, title: string) {
  await page.goto("/books");
  await page.getByRole("main").getByRole("link", { name: "Add book", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add book" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Author").fill("George Eliot");
  await dialog.getByLabel("Title").fill(title);
  await recordItem(page, title);
  await dialog.getByRole("button", { name: "Add book", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: title }).first()).toBeVisible();
  // Let the slide finish before the next check.
  await page.waitForTimeout(800);
}

test("a book added from the sheet slides into the list", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f095-a-${stamp()}@example.com`);
  await addAndOpenBook(page, "Alpha", "Want to read");
  await addFromSheet(page, "Beta");
  const motion = await readMotion(page);
  // Moved or faded in, instead of just appearing.
  expect(motion.shift > 0 || motion.faded || motion.scaleDelta > 0).toBe(true);
  await page.mouse.move(0, 0);
  await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  await expectScreens(page, "F095-list-added");
});

test("pressing a status segment gives a short press", async ({ page }) => {
  await signUpAs(page, `f095-b-${stamp()}@example.com`);
  await addAndOpenBook(page, "Pressed", "Want to read");
  const radio = page.getByRole("radiogroup", { name: "Status" }).getByRole("radio", { name: "Reading", exact: true });
  await expect(radio).toBeVisible();
  expect((await transformOf(radio)).minScale).toBe(1);
  const box = (await radio.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await transformOf(radio)).minScale).toBeLessThan(1);
  // Release away from the segment: nothing is chosen, it just settles back.
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect.poll(async () => (await transformOf(radio)).minScale).toBe(1);
});

test("pressing a star gives a short press", async ({ page }) => {
  await signUpAs(page, `f095-c-${stamp()}@example.com`);
  await addAndOpenBook(page, "Starred", "Reading");
  await saveStatus(page, "Finished");
  const star = page.getByRole("radiogroup", { name: "Rating" }).getByRole("radio", { name: "4 stars", exact: true });
  await expect(star).toBeVisible();
  const box = (await star.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await transformOf(star)).minScale).toBeLessThan(1);
  await page.mouse.up();
  await expect(star).toBeChecked();
  await expect.poll(async () => (await transformOf(star)).minScale).toBe(1);
  await expectAccessible(page);
});

test("with reduced motion nothing slides or scales", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f095-d-${stamp()}@example.com`);
  await addAndOpenBook(page, "Alpha", "Want to read");
  await addFromSheet(page, "Beta");
  const motion = await readMotion(page);
  expect(motion.shift).toBe(0);
  expect(motion.scaleDelta).toBe(0);

  // A status segment does not scale when pressed.
  await page.getByRole("link", { name: "Alpha" }).click();
  const radio = page.getByRole("radiogroup", { name: "Status" }).getByRole("radio", { name: "Reading", exact: true });
  await expect(radio).toBeVisible();
  const box = (await radio.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  expect((await transformOf(radio)).minScale).toBe(1);
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expectAccessible(page);
});
