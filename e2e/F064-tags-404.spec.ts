import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F064: the tag query must not turn a book id that is not a UUID into a 500 (decision 0002).
test("a book id that is not a UUID shows Book not found with status 404", async ({ page }) => {
  await signUpAs(page, `f064-404-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`);
  const response = await page.goto("/books/not-a-uuid");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Book not found" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F064-not-a-uuid-404.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
