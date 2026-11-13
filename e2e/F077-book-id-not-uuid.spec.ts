import { expect, test } from "@playwright/test";
import { signUpAs } from "./accounts";
import { expectAccessible } from "./a11y";

// F077: an id that is not a UUID answers the 404 "Book not found" page, not a 500.
test("/books/not-a-uuid shows Book not found with status 404", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f077-${tag}@example.com`);

  const res = await page.goto("/books/not-a-uuid");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Book not found" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F077-book-not-found.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
