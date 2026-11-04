import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F025: pages kept mounted (hidden) after navigating must not leave duplicate mains, ids or field names.
test("after moving between pages the document has one main, unique ids and single field names", async ({ page }) => {
  const email = `f025-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`;
  const expectCleanDom = async () => {
    await expect(page.locator("main")).toHaveCount(1);
    const duplicates = await page.evaluate(() => {
      const seen = new Set<string>();
      const dup: string[] = [];
      for (const el of document.querySelectorAll("[id]")) {
        if (seen.has(el.id)) dup.push(el.id);
        seen.add(el.id);
      }
      return dup;
    });
    expect(duplicates).toEqual([]);
  };

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expectCleanDom();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expectCleanDom();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
  await expect(page.locator("#email")).toHaveCount(1);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/books$/);

  await page.getByRole("link", { name: "Add book" }).first().click();
  await page.getByLabel("Title").fill("Dom Book");
  await page.getByLabel("Author").fill("Dom Author");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.getByRole("link", { name: "Dom Book" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dom Book" })).toBeVisible();
  await expectCleanDom();
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await expectCleanDom();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Author", exact: true })).toBeVisible();
  await page.goBack();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "Dom Book" })).toBeVisible();
  await expectCleanDom();
  await expect(page.locator("#status")).toHaveCount(1);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F025-book-page-after-forward.png");
});
