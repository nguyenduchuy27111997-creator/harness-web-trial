import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F056: read a finished book again; the earlier read is kept under "Past reads".
// Each test uses a fresh account and its own book (golden principle 7).
const long = (d = new Date()) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(d);

async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function addBook(page: Page, title: string, status: string) {
  await page.goto("/books/new");
  await page.getByLabel("Author").fill("George Eliot");
  await page.getByLabel("Title").fill(title);
  await pick(page, "Status", status);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function setStatus(page: Page, name: string) {
  await pick(page, "Status", name);
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved");
}

async function rate(page: Page, stars: number) {
  const group = page.getByRole("radiogroup", { name: "Rating" });
  await group.getByRole("radio", { name: stars === 1 ? "1 star" : `${stars} stars` }).click();
  await page.getByRole("button", { name: "Rate" }).click();
  await expect(page.locator("form").filter({ has: group }).getByRole("status")).toHaveText("Saved");
}

// Reading -> Finished (so the book has a start date) -> rated.
async function finishAndRate(page: Page, stars: number) {
  await setStatus(page, "Finished");
  await rate(page, stars);
}

// The "Past reads" block; the design doc gives the heading, not the container.
const pastReads = (page: Page) => page.getByRole("heading", { name: "Past reads" }).locator("xpath=..");
const stars = (scope: ReturnType<typeof pastReads>, n: number) =>
  scope.getByText(`${n} stars`).or(scope.getByLabel(`${n} stars`)).first();

test("Read again is offered only on a finished book", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f056a-${tag}@example.com`);
  const readAgain = page.getByRole("button", { name: "Read again" });

  await addBook(page, `Want ${tag}`, "Want to read");
  await expect(readAgain).toHaveCount(0);

  await addBook(page, `Reading ${tag}`, "Reading");
  await expect(readAgain).toHaveCount(0);

  await setStatus(page, "Finished");
  await rate(page, 4);
  await expect(readAgain).toBeVisible();
  await page.reload();
  await expect(readAgain).toBeVisible();
});

test("Read again restarts the book and keeps the earlier read under Past reads", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const title = `Middlemarch ${tag}`;
  await signUpAs(page, `f056b-${tag}@example.com`);
  await addBook(page, title, "Reading");
  await finishAndRate(page, 4);

  await page.getByRole("button", { name: "Read again" }).click();

  const check = async () => {
    await expect(page.getByRole("combobox", { name: "Status" })).toContainText("Reading");
    await expect(page.getByText(`Started on ${long()}`).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Read again" })).toHaveCount(0);
    await expect(page.getByRole("radiogroup", { name: "Rating" })).toHaveCount(0);
    const past = pastReads(page);
    await expect(past).toBeVisible();
    await expect(past.getByText(`Started on ${long()}`)).toBeVisible();
    await expect(past.getByText(`Finished on ${long()}`)).toBeVisible();
    await expect(stars(past, 4)).toBeVisible();
    // No finish date outside the past read.
    await expect(page.getByText(/Finished on/)).toHaveCount(1);
  };
  await check();
  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await check();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F056-past-reads.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [page.getByText(/Started on/), page.getByText(/Finished on/), page.getByRole("heading", { level: 1 })],
  });
});

test("reading again twice lists both past reads, newest first", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f056c-${tag}@example.com`);
  await addBook(page, `Persuasion ${tag}`, "Reading");
  await finishAndRate(page, 4);
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(pastReads(page)).toBeVisible();

  await finishAndRate(page, 5);
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(page.getByRole("button", { name: "Read again" })).toHaveCount(0);

  await page.reload();
  const items = pastReads(page).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(stars(items.nth(0), 5)).toBeVisible();
  await expect(stars(items.nth(1), 4)).toBeVisible();
});
