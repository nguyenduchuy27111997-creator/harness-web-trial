import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

const HEADER = "title,author,status,rating,total_pages,started_on,finished_on";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function csvFile(text: string) {
  return { name: "books.csv", mimeType: "text/csv", buffer: Buffer.from(text) };
}

async function openLibrary(page: Page) {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Import / export" })).toBeVisible();
}

async function importFile(page: Page, text: string) {
  await page.getByLabel("Import CSV").setInputFiles(csvFile(text));
}

// The browser may be remote, so save the download locally before reading it.
async function exportedText(page: Page, testInfo: { outputPath: (name: string) => string }) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  const target = testInfo.outputPath("bookshelf.csv");
  await download.saveAs(target);
  return (await readFile(target, "utf8")).replace(/^﻿/, "");
}

test("choosing a file previews the rows, and Add N books adds them", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f069-a-${tag}@example.com`);
  const finished = `Imported Finished ${tag}`;
  const reading = `Imported Reading ${tag}`;
  const text = [
    HEADER,
    `${finished},Ann Author,finished,4,250,${daysAgo(20)},${daysAgo(10)}`,
    `${reading},Bob Writer,reading,,320,${daysAgo(3)},`,
    "",
  ].join("\n");

  await openLibrary(page);
  await importFile(page, text);

  const preview = page.getByRole("table");
  await expect(preview.getByText(finished)).toBeVisible();
  await expect(preview.getByText(reading)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add 2 books" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F069-import-preview.png", {
    mask: [page.getByLabel("Import CSV"), preview],
  });

  await page.getByRole("button", { name: "Add 2 books" }).click();
  await expect(page.getByText(/Added 2 books/)).toBeVisible();

  await page.goto("/books");
  await expect(page.getByRole("link", { name: finished })).toBeVisible();
  await expect(page.getByRole("link", { name: reading })).toBeVisible();

  // Pages are kept: a Reading book shows its progress against the imported total.
  await page.getByRole("link", { name: reading }).click();
  await expect(page.getByRole("heading", { name: reading })).toBeVisible();
  await expect(page.getByText(/Page 0 of 320/)).toBeVisible();
});

test("Cancel adds nothing", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f069-b-${tag}@example.com`);
  const title = `Cancelled Import ${tag}`;

  await openLibrary(page);
  await importFile(page, `${HEADER}\n${title},Cy Author,want_to_read,,,,\n`);
  await expect(page.getByRole("table").getByText(title)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeHidden();
  await expect(page.getByRole("table")).toBeHidden();

  await page.goto("/books");
  await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("a file exported from one account imports into a new account unchanged", async ({ page }, testInfo) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f069-c-${tag}@example.com`);
  const seed = [
    HEADER,
    `Round Finished ${tag},Ann Author,finished,5,300,${daysAgo(30)},${daysAgo(12)}`,
    `Round Reading ${tag},Bob Writer,reading,,120,${daysAgo(2)},`,
    `Round Want ${tag},Cy Author,want_to_read,,,,`,
    "",
  ].join("\n");

  await openLibrary(page);
  await importFile(page, seed);
  await page.getByRole("button", { name: "Add 3 books" }).click();
  await expect(page.getByText(/Added 3 books/)).toBeVisible();
  const first = await exportedText(page, testInfo);
  expect(first).toContain(`Round Finished ${tag},Ann Author,finished,5,300,`);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signUpAs(page, `f069-d-${tag}@example.com`);
  await openLibrary(page);
  await importFile(page, first);
  await page.getByRole("button", { name: "Add 3 books" }).click();
  await expect(page.getByText(/Added 3 books/)).toBeVisible();

  const second = await exportedText(page, testInfo);
  const rows = (s: string) => s.split(/\r?\n/).filter((l) => l !== "").sort();
  expect(rows(second)).toEqual(rows(first));
});

test("a file over 1 MB is refused before any preview", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f069-e-${tag}@example.com`);
  await openLibrary(page);

  const filler = "x".repeat(200);
  const lines = Array.from({ length: 5200 }, (_, i) => `T${i},${filler},want_to_read,,,,`);
  await importFile(page, [HEADER, ...lines].join("\n"));

  await expect(page.getByText("The file is too large")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Add \d+ books?$/ })).toHaveCount(0);
  await expectAccessible(page);
});

test("a file with more than 1,000 rows is refused before any preview", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f069-f-${tag}@example.com`);
  await openLibrary(page);

  const lines = Array.from({ length: 1001 }, (_, i) => `R${i},A,want_to_read,,,,`);
  await importFile(page, [HEADER, ...lines].join("\n"));

  await expect(page.getByText("The file is too large")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Add \d+ books?$/ })).toHaveCount(0);
});
