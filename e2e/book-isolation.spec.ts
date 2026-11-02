import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F008: each account only sees its own books. Two fresh accounts per run (golden principle 7).
test("I only see my own books", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  const title = `Isolation Book ${tag}`;
  const emailA = `f008-a-${tag}@example.com`;
  const emailB = `f008-b-${tag}@example.com`;

  async function signUp(email: string) {
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("secret123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/books$/);
  }

  await signUp(emailA);
  await page.goto("/books/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Author A");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await signUp(emailB);
  await page.goto("/books");
  await expect(page.getByText("Your shelf is empty. Add your first book to get started.")).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  await expectAccessible(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(emailA);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F008-own-books.png", { mask: [page.getByRole("listitem")] });
});
