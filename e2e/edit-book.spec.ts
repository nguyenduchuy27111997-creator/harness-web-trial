import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

// F018: fix a typo in a book's title from its page; Cancel changes nothing.
// Each run uses a fresh account (golden principle 7).
test("edit a book's title and author", async ({ page }) => {
  await page.goto("/sign-up");
  const email = `f018-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`;
  for (const [label, value] of [["Email", email], ["Password", "secret123"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await page.goto("/books/new");
  for (const [label, value] of [["Title", "Midlemarch"], ["Author", "George Eliot"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Midlemarch" }).click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);

  const title = page.getByRole("textbox", { name: "Title" });
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(title).toHaveValue("Midlemarch");
  await expect(page.getByRole("textbox", { name: "Author" })).toHaveValue("George Eliot");
  await expectAccessible(page);

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(title).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Midlemarch" })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await title.fill("Middlemarch");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();
  await expect(title).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Middlemarch" })).toBeVisible();

  await page.goto("/books");
  const list = page.getByRole("main");
  await expect(list.getByRole("link", { name: "Middlemarch" })).toBeVisible();
  await expect(list.getByText("George Eliot")).toBeVisible();
  await expect(list.getByText("Midlemarch")).toHaveCount(0);
  await expectAccessible(page);

  await page.getByRole("link", { name: "Middlemarch" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(title).toBeVisible();
  await expect(page).toHaveScreenshot("F018-edit-open.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
