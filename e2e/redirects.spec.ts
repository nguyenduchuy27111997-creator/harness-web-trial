import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F003: signed-out visitors are sent to sign in. Own account per run (golden principle 7).
test("signed-out visitors are sent to sign in", async ({ page }) => {
  const email = `f003-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`;
  const password = "secret123";

  await page.goto("/sign-up");
  for (const [label, value] of [["Email", email], ["Password", password]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/books$/);

  await page.context().clearCookies();
  await page.goto("/books");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expectAccessible(page);

  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto("/books");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot("F003-books.png");
});
