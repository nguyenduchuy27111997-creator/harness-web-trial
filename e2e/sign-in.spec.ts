import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F002: sign in and sign out from the header. Own account per run (golden principle 7).
test("sign in and sign out from the header", async ({ page }) => {
  const email = `f002-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
  // The button fades back from disabled:opacity-50; axe would measure contrast mid-transition.
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCSS("opacity", "1");
  await expectAccessible(page);

  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page).toHaveScreenshot("F002-sign-in.png");
});
