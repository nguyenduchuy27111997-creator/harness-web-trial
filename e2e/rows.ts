import type { Page } from "@playwright/test";

// Opens the row's "Actions for <name>" menu and picks `item` (M9 row actions menu).
export async function rowAction(page: Page, name: string, item: string) {
  await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

// The dialog a row action opened (Rename, Share).
export const rowDialog = (page: Page) => page.getByRole("dialog");
