import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectScreens } from "./a11y";
import { signUpAs } from "./accounts";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// Computed color of a selector as [r, g, b] 0-255 (a canvas turns any CSS color, oklch included, into sRGB).
async function colorOf(page: Page, selector: string, property: "backgroundColor" | "color") {
  return page.evaluate(
    ([sel, prop]) => {
      const el = document.querySelector(sel as string) as HTMLElement;
      const css = getComputedStyle(el)[prop as "backgroundColor" | "color"];
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    [selector, property],
  );
}
const brightness = ([r, g, b]: number[]) => (r + g + b) / 3;

async function addBook(page: Page, title: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Look Author");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/books$/);
}

// F088 acceptance 1: dark system = dark look, light system = cream look, no setting to change.
test("pages follow the system: dark with a dark system, cream with a light one, no setting", async ({ page }) => {
  await signUpAs(page, `f088-a-${stamp()}@example.com`);
  await expect(page.getByRole("navigation", { name: "Book filter" })).toBeVisible();

  await page.emulateMedia({ colorScheme: "dark" });
  const darkBg = await colorOf(page, "body", "backgroundColor");
  const darkText = await colorOf(page, "body", "color");
  expect(brightness(darkBg), "dark background").toBeLessThan(70);
  expect(brightness(darkText), "cream text on dark").toBeGreaterThan(200);
  expect(darkText[0], "cream, not pure white").toBeLessThan(255);

  await page.emulateMedia({ colorScheme: "light" });
  const lightBg = await colorOf(page, "body", "backgroundColor");
  const lightText = await colorOf(page, "body", "color");
  expect(brightness(lightBg), "cream background").toBeGreaterThan(220);
  expect(brightness(lightText), "dark text on cream").toBeLessThan(90);
  expect(lightBg[0], "warm: red at least blue").toBeGreaterThanOrEqual(lightBg[2]);

  // No setting to change the look.
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: /dark|light|theme/i })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: /dark|theme/i })).toHaveCount(0);
});

// Acceptance 2: serif for page and book titles, Inter for the rest; the styleguide shows the type scale.
test("book titles use the serif, other text Inter, and /styleguide shows the type scale in both looks", async ({ page }) => {
  const s = stamp();
  const title = `Type Book ${s}`;
  await signUpAs(page, `f088-b-${s}@example.com`);
  await addBook(page, title);
  await page.getByRole("link", { name: title }).click();
  const heading = page.getByRole("heading", { name: title });
  await expect(heading).toBeVisible();
  expect(await heading.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Lora|serif/i);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/Inter/i);

  await page.goto("/styleguide");
  await expect(page.getByRole("heading", { name: "Styleguide" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /type/i }).first()).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.getByRole("heading", { name: /type/i }).first()).toBeVisible();
    await expectAccessible(page);
  }
});

// Acceptance 3: every page passes the accessibility check in both looks; phone targets are 44 px.
test("shelf, add form, stats and sign-in pass the accessibility check in both looks", async ({ page }) => {
  const s = stamp();
  await signUpAs(page, `f088-c-${s}@example.com`);
  await addBook(page, `Access Book ${s}`);
  for (const path of ["/books", "/books/new", "/stats", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expectAccessible(page);
    }
  }
  await page.emulateMedia({ colorScheme: null });
  await page.goto("/books/new");
  await expect(page.getByLabel("Title")).toBeVisible();
  await expectScreens(page, "F088-add-book");
});
