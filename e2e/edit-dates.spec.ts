import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F054: edit a book's start and finish dates on its page.
// Each test uses a fresh account and its own book (golden principle 7).
const todayIso = new Date().toISOString().slice(0, 10);
const long = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });

async function openNewBook(page: Page, email: string, title: string, status: string) {
  await signUpAs(page, email);
  await page.goto("/books/new");
  await page.getByLabel("Author").fill("Jane Austen");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: status, exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function saveDates(page: Page, started: string, finished: string) {
  await page.getByRole("button", { name: "Edit dates" }).click();
  await page.getByLabel("Started").fill(started);
  await page.getByLabel("Finished").fill(finished);
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

async function expectOct(page: Page) {
  await expect(page.getByText(`Started on ${long("2026-10-01")}`)).toBeVisible();
  await expect(page.getByText(`Finished on ${long("2026-10-12")}`)).toBeVisible();
  await expect(page.getByText("Read in 12 days", { exact: true })).toBeVisible();
}

test("editing a finished book's dates shows them and 'Read in 12 days', also after reload", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openNewBook(page, `f054-${tag}@example.com`, `Persuasion ${tag}`, "Finished");

  await page.getByRole("button", { name: "Edit dates" }).click();
  await expect(page.getByLabel("Started")).toHaveValue("");
  await expect(page.getByLabel("Finished")).toHaveValue(todayIso);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel("Started").fill("2026-10-01");
  await page.getByLabel("Finished").fill("2026-10-12");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expectOct(page);
  await page.reload();
  await expectOct(page);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F054-dates-edited.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByRole("heading")],
  });
});

test("Cancel leaves the dates unchanged", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openNewBook(page, `f054b-${tag}@example.com`, `Emma ${tag}`, "Finished");

  await saveDates(page, "2026-10-01", "2026-10-12");
  await expect(page.getByText("Read in 12 days", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit dates" }).click();
  await expect(page.getByLabel("Started")).toHaveValue("2026-10-01");
  await expect(page.getByLabel("Finished")).toHaveValue("2026-10-12");
  await page.getByLabel("Started").fill("2026-10-05");
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByLabel("Started")).toHaveCount(0);
  await expectOct(page);
  await page.reload();
  await expectOct(page);
});

test("a Reading book's Edit dates shows only Started", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await openNewBook(page, `f054c-${tag}@example.com`, `Northanger ${tag}`, "Reading");

  await page.getByRole("button", { name: "Edit dates" }).click();
  await expect(page.getByLabel("Started")).toHaveValue(todayIso);
  await expect(page.getByLabel("Finished")).toHaveCount(0);

  await page.getByLabel("Started").fill("2026-10-05");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(`Started on ${long("2026-10-05")}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Started on ${long("2026-10-05")}`)).toBeVisible();
  await expect(page.getByText(/Finished on/)).toHaveCount(0);
  await expectAccessible(page);
});
