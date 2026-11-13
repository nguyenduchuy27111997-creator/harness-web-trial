import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { pick } from "./books";

const HEADER = "title,author,status,rating,total_pages,started_on,finished_on";

async function addBook(page: Page, title: string, author: string, status: string) {
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill(author);
  await pick(page, "Status", status);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/books$/);
}

// The browser may be remote (Docker), so save the download locally before reading it.
async function downloadCsv(page: Page, testInfo: { outputPath: (name: string) => string }) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("bookshelf.csv");
  const target = testInfo.outputPath("bookshelf.csv");
  await download.saveAs(target);
  const text = (await readFile(target, "utf8")).replace(/^﻿/, "");
  return text.split(/\r?\n/).filter((line) => line !== "");
}

test("I download my library as bookshelf.csv", async ({ page }, testInfo) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f068-a-${tag}@example.com`);

  const plain = `Plain Export ${tag}`;
  const tricky = `Comma, "Quote" ${tag}`;
  await addBook(page, plain, "Ann Author", "Want to read");
  await addBook(page, tricky, "Bob Writer", "Finished");

  await page.getByRole("link", { name: "Import / export" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Import / export" })).toBeVisible();
  await expectAccessible(page);

  const lines = await downloadCsv(page, testInfo);
  expect(lines[0]).toBe(HEADER);
  expect(lines).toHaveLength(3);

  // An empty value is an empty cell: a Want to read book has no rating, pages or dates.
  expect(lines).toContain(`${plain},Ann Author,want_to_read,,,,`);

  // Comma and double quote: quoted, with the quote doubled.
  const quoted = lines.find((l) => l.startsWith(`"Comma, ""Quote"" ${tag}"`));
  expect(quoted).toBeDefined();
  expect(quoted).toMatch(/^".*",Bob Writer,finished,,,(\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?$/);

  await expect(page.getByRole("heading", { name: "Import / export" })).toBeVisible();
  await expect(page).toHaveScreenshot("F068-library.png");
});

test("another account's books never appear in my file", async ({ page }, testInfo) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const theirs = `Theirs Export ${tag}`;
  const mine = `Mine Export ${tag}`;

  await signUpAs(page, `f068-b-${tag}@example.com`);
  await addBook(page, theirs, "Other Person", "Reading");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await signUpAs(page, `f068-c-${tag}@example.com`);
  await addBook(page, mine, "Me Myself", "Want to read");
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Import / export" })).toBeVisible();
  await expectAccessible(page);

  const lines = await downloadCsv(page, testInfo);
  expect(lines).toEqual([HEADER, `${mine},Me Myself,want_to_read,,,,`]);
  expect(lines.join("\n")).not.toContain(theirs);
});
