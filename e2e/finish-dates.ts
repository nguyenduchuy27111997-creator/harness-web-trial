import { expect, type Page } from "@playwright/test";

// On a finished book's page: sets the finish date through "Edit dates" and waits for the form to close.
export async function setFinishDate(page: Page, iso: string) {
  await page.getByRole("button", { name: "Edit dates" }).click();
  await page.getByLabel("Finished").fill(iso);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit dates" })).toBeVisible();
}
