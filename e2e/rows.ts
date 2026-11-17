import { expect, type Page } from "@playwright/test";

// Opens the row's "Actions for <name>" menu and picks `item` (M9 row actions menu).
export async function rowAction(page: Page, name: string, item: string) {
  await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
  const menuitem = page.getByRole("menu").getByRole("menuitem", { name: item, exact: true });
  await expect(menuitem).toBeVisible();
  await menuitem.click();
  // The open menu hides the rest of the page from the accessibility tree until it closes.
  await expect(page.getByRole("menu")).toHaveCount(0);
}

// The dialog a row action opened (Rename, Share).
export const rowDialog = (page: Page) => page.getByRole("dialog");
