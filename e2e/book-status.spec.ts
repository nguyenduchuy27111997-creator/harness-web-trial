import { expect, test } from "@playwright/test";
import { saveStatus } from "./books";
import { expectAccessible, expectScreens } from "./a11y";

// F010: change a book's status; finishing records today's date, leaving Finished hides it.
// Each run uses a fresh account (golden principle 7).
test("change status and finish date", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(`f010-${tag}@example.com`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/books/new");
  await page.getByLabel("Title").fill("Status Book");
  await page.getByLabel("Author").fill("Status Author");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.getByRole("link", { name: "Status Book" }).click();
  const main = page.locator("main");

  const setStatus = async (name: string) => {
    await saveStatus(page, name);
    await expect(page.getByRole("status")).toHaveText("Saved");
    await expect(page.getByRole("radiogroup", { name: "Status" }).getByRole("radio", { name, exact: true })).toBeChecked();
  };

  await setStatus("Reading");
  await expect(main.getByText("Reading", { exact: true }).first()).toBeVisible();
  await page.goto("/books");
  await expect(page.getByRole("listitem").filter({ hasText: "Status Book" }).getByText("Reading", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Status Book" }).click();

  await setStatus("Finished");
  const today = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date());
  await expect(page.getByText(`Finished on ${today}`)).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F010-finished.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Started on/), page.getByText(/Finished on/)],
  });

  await expect(page.getByRole("radiogroup", { name: "Status" }).getByRole("radio", { name: "Finished", exact: true })).toBeChecked();
  await saveStatus(page, "Reading");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByText(/Finished on/)).toHaveCount(0);
  await expectScreens(page, "book-status-book-page", { mask: [page.getByText(/(Started|Finished) on/)] });
});
