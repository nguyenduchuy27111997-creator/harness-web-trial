import { expect, test, type Page } from "@playwright/test";
import { expectScreens } from "./a11y";
import { signOut, signUpAs } from "./accounts";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const link = (page: Page, name: string) => page.getByRole("link", { name, exact: true });

async function setDisplayName(page: Page, name: string) {
  await page.goto("/settings");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue(name);
}

// Acceptance 1: a sidebar on a computer, the current page marked.
test("on a computer a sidebar lists the destinations and marks the page I am on", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f089-a-${stamp()}@example.com`);
  for (const name of ["My books", "Up next", "Shelves", "Tags", "Quotes", "Stats", "Import / export", "Settings"]) {
    await expect(link(page, name)).toBeVisible();
  }
  // No phone tab bar, so no "More".
  await expect(page.getByRole("button", { name: "More" })).toHaveCount(0);
  await expect(link(page, "My books")).toHaveAttribute("aria-current", "page");
  await expect(link(page, "Stats")).not.toHaveAttribute("aria-current", "page");

  // Import / export and Settings sit at the bottom, below the other destinations.
  const y = async (name: string) => (await link(page, name).boundingBox())!.y;
  expect(await y("Import / export")).toBeGreaterThan(await y("Stats"));
  expect(await y("Settings")).toBeGreaterThan(await y("Import / export"));

  await link(page, "Stats").click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(link(page, "Stats")).toHaveAttribute("aria-current", "page");
  await expect(link(page, "My books")).not.toHaveAttribute("aria-current", "page");

  await link(page, "Settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(link(page, "Settings")).toHaveAttribute("aria-current", "page");
});

// Acceptance 2: a bar at the bottom on a phone; More opens the rest.
test("on a phone a bottom bar holds My books, Up next, Shelves, Stats and More", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signUpAs(page, `f089-b-${stamp()}@example.com`);
  for (const name of ["My books", "Up next", "Shelves", "Stats"]) await expect(link(page, name)).toBeVisible();
  const more = page.getByRole("button", { name: "More" });
  await expect(more).toBeVisible();
  for (const name of ["Tags", "Quotes", "Import / export", "Settings"]) await expect(link(page, name)).toHaveCount(0);

  // The bar sits at the bottom of the screen.
  expect((await link(page, "Up next").boundingBox())!.y).toBeGreaterThan(PHONE.height - 120);
  await expect(link(page, "My books")).toHaveAttribute("aria-current", "page");

  await more.click();
  for (const name of ["Tags", "Quotes", "Import / export", "Settings"]) await expect(link(page, name)).toBeVisible();
  await link(page, "Tags").click();
  await expect(page).toHaveURL(/\/tags$/);

  await link(page, "Shelves").click();
  await expect(page).toHaveURL(/\/shelves$/);
  await expect(link(page, "Shelves")).toHaveAttribute("aria-current", "page");
});

// Acceptance 3, first half: my name and Sign out are in an account menu.
test("my name and Sign out sit in an account menu", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f089-c-${stamp()}@example.com`);
  await setDisplayName(page, "Huy");
  await page.goto("/up-next");
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);

  await page.getByRole("button", { name: "Huy" }).click();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeHidden();

  await page.getByRole("button", { name: "Huy" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  // Signed out: no navigation.
  await expect(link(page, "Up next")).toHaveCount(0);
});

test("signing out through the helper returns to the sign-in page", async ({ page }) => {
  await signUpAs(page, `f089-f-${stamp()}@example.com`);
  await signOut(page);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

// Acceptance 3, second half: the top bar stays in place and blurs what scrolls under it.
test("the top bar stays in place while I scroll, with the page blurred under it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await signUpAs(page, `f089-d-${stamp()}@example.com`);
  await page.goto("/styleguide");
  await expect(page.getByRole("heading", { name: "Styleguide" })).toBeVisible();
  const header = page.getByRole("banner");
  await expect(header).toBeVisible();
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(scrollable, "page is long enough to scroll").toBeGreaterThan(200);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  expect((await header.boundingBox())!.y).toBeLessThanOrEqual(1);
  await expect(header.getByRole("button", { name: /account|@/i })).toBeVisible();
  expect(await header.evaluate((el) => getComputedStyle(el).backdropFilter)).toMatch(/blur/);
});

// Closing baselines. The names match the baselines already in e2e/__screenshots__/F089-navigation.spec.ts/.
test("the sidebar on a computer", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signUpAs(page, `f089-e-${stamp()}@example.com`);
  await setDisplayName(page, "Huy");
  await page.goto("/up-next");
  await expect(page.getByRole("heading", { name: "Up next" })).toBeVisible();
  await expect(link(page, "Up next")).toHaveAttribute("aria-current", "page");
  await expectScreens(page, "F089-sidebar");
});

test("the tab bar on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signUpAs(page, `f089-g-${stamp()}@example.com`);
  await setDisplayName(page, "Huy");
  await page.goto("/up-next");
  await expect(page.getByRole("heading", { name: "Up next" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More" })).toBeVisible();
  await expectScreens(page, "F089-tab-bar");
});
