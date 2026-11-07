import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F052: moving a book to Reading records today's start date.
// Each test uses a fresh account and its own book (golden principle 7).
const today = () => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date());

async function addBook(page: Page, title: string, status?: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("George Eliot");
  if (status) {
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: status }).click();
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function setStatus(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name }).click();
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
}

test("start date appears on Reading and goes away on Want to read", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f052-${tag}@example.com`);
  await addBook(page, `Middlemarch ${tag}`);
  await expect(page.getByText(/Started on/)).toHaveCount(0);

  await setStatus(page, "Reading");
  await expect(page.getByText(`Started on ${today()}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Started on ${today()}`)).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F052-started.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Started on/), page.getByRole("heading")],
  });

  await setStatus(page, "Want to read");
  await expect(page.getByText(/Started on/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: `Middlemarch ${tag}` })).toBeVisible();
  await expect(page.getByText(/Started on/)).toHaveCount(0);
});

test("a book without a start date opens without errors", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f052b-${tag}@example.com`);
  // Added as Finished, so it has no start date (stands in for books that predate the change).
  await addBook(page, `Old Book ${tag}`, "Finished");
  await expect(page.getByText(/Started on/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: `Old Book ${tag}` })).toBeVisible();
  await expect(page.getByText(/Started on/)).toHaveCount(0);
  await expectAccessible(page);
});
