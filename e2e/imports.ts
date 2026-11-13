import { expect, type Page } from "@playwright/test";

export const IMPORT_HEADER = "title,author,status,rating,total_pages,started_on,finished_on";

export async function openLibrary(page: Page) {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Import / export" })).toBeVisible();
}

export async function importFile(page: Page, text: string) {
  await page.getByLabel("Import CSV").setInputFiles({ name: "books.csv", mimeType: "text/csv", buffer: Buffer.from(text) });
}
