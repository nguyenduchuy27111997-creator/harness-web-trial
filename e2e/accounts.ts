import { expect, type Page } from "@playwright/test";

export async function signUpAs(page: Page, email: string) {
  await page.goto("/sign-up");
  for (const [label, value] of [["Email", email], ["Password", "secret123"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
}
