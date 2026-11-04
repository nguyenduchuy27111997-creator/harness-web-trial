import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F017: a signed-in user opening /sign-in or /sign-up lands on /books. Own account per run (golden principle 7).
test("signed-in users are sent from the auth pages to their books", async ({ page }) => {
  await signUpAs(page, `f017-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  for (const path of ["/sign-in", "/sign-up"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/books$/);
    await expect(page.getByRole("heading", { name: "My books" })).toBeVisible();
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F017-sign-up.png");
});
