import { expect, type Page } from "@playwright/test";

export async function signUpAs(page: Page, email: string) {
  await page.goto("/sign-up");
  for (const [label, value] of [["Email", email], ["Password", "secret123"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
}

// Signs out through the account menu (F089): open it, choose Sign out, wait for the sign-in page.
export async function signOut(page: Page) {
  await page.getByRole("button", { name: /account|@/i }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}
