import { expect, test } from "@playwright/test";
import { expectAccessible, expectScreens } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { openLibrary } from "./imports";
import { createShelves, shareShelfLink, shelveOpenBook } from "./shelves";

// F096: sign-in, settings, import and shared shelves match the new look. Each test has its own account (golden principle 7).
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

test("sign in and sign up are a centered card under the app name, with errors under their field", async ({ page }) => {
  for (const [path, heading, button] of [["/sign-in", "Sign in", "Sign in"], ["/sign-up", "Sign up", "Sign up"]]) {
    await page.goto(path);
    const title = page.getByRole("heading", { name: heading });
    await expect(title).toBeVisible();
    // The app name (brand) sits in the top bar, above the card's title.
    const brand = page.getByRole("banner").getByText("Bookshelf").first();
    await expect(brand).toBeVisible();
    const brandBox = (await brand.boundingBox())!;
    const titleBox = (await title.boundingBox())!;
    expect(brandBox.y).toBeLessThan(titleBox.y);

    // The card's button is centered horizontally in the window.
    const viewport = page.viewportSize()!;
    const submit = page.getByRole("button", { name: button, exact: true });
    const box = (await submit.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(4);
    expect(box.width).toBeLessThanOrEqual(400);
  }

  // Empty email and a short password: each error sits under its own field.
  await page.getByLabel("Password").fill("12345");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  const emailError = page.getByText("Email is required");
  const passwordError = page.getByText("Password must be at least 6 characters");
  await expect(emailError).toBeVisible();
  await expect(passwordError).toBeVisible();
  const emailField = (await page.getByLabel("Email").boundingBox())!;
  const passwordField = (await page.getByLabel("Password").boundingBox())!;
  expect((await emailError.boundingBox())!.y).toBeGreaterThanOrEqual(emailField.y + emailField.height - 1);
  expect((await emailError.boundingBox())!.y).toBeLessThan(passwordField.y);
  expect((await passwordError.boundingBox())!.y).toBeGreaterThanOrEqual(passwordField.y + passwordField.height - 1);
  await page.mouse.move(0, 0);
  await expectScreens(page, "F096-sign-up-errors");
});

test("settings groups my name, account and delete account", async ({ page }) => {
  const email = `f096-set-${stamp()}@example.com`;
  await signUpAs(page, email);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  // Group names are from the design doc (docs/design/M9.md); exact, since "Delete account" contains "account".
  const headings = [
    page.getByRole("heading", { name: "Profile", exact: true }),
    page.getByRole("heading", { name: "Account", exact: true }),
    page.getByRole("heading", { name: "Delete account", exact: true }),
  ];
  const tops: number[] = [];
  for (const heading of headings) {
    await expect(heading).toBeVisible();
    tops.push((await heading.boundingBox())!.y);
  }
  expect(tops).toEqual([...tops].sort((a, b) => a - b));

  const main = page.getByRole("main");
  await expect(main.getByLabel("Display name")).toBeVisible();
  await expect(main.getByText(email)).toBeVisible();
  await expect(main.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Delete account" })).toBeVisible();

  await page.mouse.move(0, 0);
  await expectScreens(page, "F096-settings", {
    mask: [main.getByText(email).locator(".."), page.getByRole("banner")],
  });
});

test("import / export has its two groups in the new look", async ({ page }) => {
  await signUpAs(page, `f096-lib-${stamp()}@example.com`);
  await openLibrary(page);
  await expect(page.getByRole("heading", { level: 1, name: "Import / export" })).toBeVisible();
  await expect(page.getByLabel("Import CSV")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" }).or(page.getByRole("button", { name: "Download CSV" }))).toBeVisible();
  await page.mouse.move(0, 0);
  await expectScreens(page, "F096-library", { mask: [page.getByRole("banner")] });
});

test("a shared shelf page reads in the same look", async ({ page, browser }) => {
  const id = stamp();
  await signUpAs(page, `f096-share-${id}@example.com`);
  const shelf = `Club ${id}`;
  const title = `Shared ${id}`;
  await createShelves(page, [shelf]);
  await addAndOpenBook(page, title, "Finished");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await shelveOpenBook(page, shelf);
  await page.goto("/shelves");
  const url = await shareShelfLink(page, shelf);

  const context = await browser.newContext();
  const anon = await context.newPage();
  await anon.goto(url);
  await expect(anon.getByRole("heading", { level: 1, name: shelf })).toBeVisible();
  await expect(anon.getByRole("listitem").filter({ hasText: title })).toBeVisible();
  await anon.mouse.move(0, 0);
  await expectAccessible(anon);
  await expectScreens(anon, "F096-shared-shelf", {
    mask: [anon.getByRole("heading", { level: 1 }), anon.getByRole("listitem")],
  });
  await context.close();
});
