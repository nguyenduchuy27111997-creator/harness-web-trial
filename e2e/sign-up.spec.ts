import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F001: sign up with email and password. Each run uses a fresh email (golden principle 7).
test("sign up with email and password", async ({ page }) => {
  const email = `f001-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  await expectAccessible(page);

  // Empty email and a 5-character password: an error next to each field.
  await page.getByLabel("Password").fill("12345");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("Email is required")).toBeVisible();
  await expect(page.getByText("Password must be at least 6 characters")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/sign-up$/);
  await expectAccessible(page);

  // A new account signs in at once and lands on /books.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expectAccessible(page);

  // Signed out, the same email again: a form error and no new account.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/sign-up");
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("another123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("An account with this email already exists")).toHaveText("An account with this email already exists");
  await expect(page).toHaveURL(/\/sign-up$/);
  await page.mouse.move(0, 0); // not hovering the button
  await expectAccessible(page);

  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.getByLabel("Email").fill("f001@example.com");
  await expect(page).toHaveScreenshot("F001-duplicate-email.png");
});
