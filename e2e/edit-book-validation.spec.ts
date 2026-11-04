import { expect, test } from "@playwright/test";
import { signUpAs } from "./accounts";
import { expectAccessible } from "./a11y";

// F019: edit-book validation errors show next to each field and nothing is saved.
// Each run uses a fresh account (golden principle 7).
test("edit-book validation errors appear next to the field", async ({ page }) => {
  const email = `f019-${process.env.HARNESS_LANE ?? "local"}-${Date.now()}@example.com`;
  await signUpAs(page, email);
  await page.goto("/books/new");
  for (const [label, value] of [["Title", "Emma"], ["Author", "Jane Austen"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Emma" }).click();
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);

  const title = page.getByRole("textbox", { name: "Title" });
  const author = page.getByRole("textbox", { name: "Author" });
  const save = page.getByRole("button", { name: "Save details" });
  await page.getByRole("button", { name: "Edit" }).click();

  await title.fill("");
  await author.fill("");
  await save.click();
  await expect(page.getByText("Title is required")).toBeVisible();
  await expect(page.getByText("Author is required")).toBeVisible();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(author).toHaveAttribute("aria-invalid", "true");
  await expectAccessible(page);

  await title.fill("t".repeat(201));
  await author.fill("Jane Austen");
  await save.click();
  await expect(page.getByText("Title must be at most 200 characters")).toBeVisible();
  await expect(page.getByText("Author is required")).toHaveCount(0);

  await title.fill("Emma");
  await author.fill("a".repeat(121));
  await save.click();
  await expect(page.getByText("Author must be at most 120 characters")).toBeVisible();
  await expect(page.getByText("Title must be at most 200 characters")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Emma" })).toBeVisible();
  await page.goto("/books");
  await expect(page.getByRole("main").getByText("Jane Austen")).toBeVisible();

  await page.getByRole("link", { name: "Emma" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await title.fill("Persuasion");
  await author.fill("J. Austen");
  await save.click();
  await expect(page.getByRole("heading", { name: "Persuasion" })).toBeVisible();
  await page.goto("/books");
  const list = page.getByRole("main");
  await expect(list.getByRole("link", { name: "Persuasion" })).toBeVisible();
  await expect(list.getByText("J. Austen")).toBeVisible();

  await page.getByRole("link", { name: "Persuasion" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await title.fill("");
  await save.click();
  await expect(page.getByText("Title is required")).toBeVisible();
  await expect(page).toHaveScreenshot("F019-edit-errors.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
