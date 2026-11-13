import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";

// F074: delete my account after typing DELETE. Each test has its own accounts (golden principle 7).
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

async function openDeleteDialog(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Delete account" }).click();
  return page.getByRole("dialog");
}

test("Delete my account stays disabled until DELETE is typed", async ({ page }) => {
  await signUpAs(page, `f074a-${stamp()}@example.com`);
  const dialog = await openDeleteDialog(page);
  const confirm = dialog.getByRole("button", { name: "Delete my account" });
  await expect(confirm).toBeDisabled();

  const field = dialog.getByLabel("Type DELETE to confirm");
  await field.fill("delete");
  await expect(confirm).toBeDisabled();
  await field.fill("DELETE ");
  await expect(confirm).toBeDisabled();
  await field.fill("DELETE");
  await expect(confirm).toBeEnabled();
  await expectAccessible(page);
});

test("deleting the account signs out, blocks sign in again and leaves another account alone", async ({ page }) => {
  const id = stamp();
  const emailA = `f074b-${id}@example.com`;
  const emailB = `f074c-${id}@example.com`;
  const bookA = `Middlemarch A ${id}`;
  const bookB = `Middlemarch B ${id}`;

  // Account B with a book.
  await signUpAs(page, emailB);
  await addAndOpenBook(page, bookB, "Reading");
  await expect(page.getByRole("heading", { name: bookB })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  // Account A with a book, then delete it.
  await signUpAs(page, emailA);
  await addAndOpenBook(page, bookA, "Want to read");
  await expect(page.getByRole("heading", { name: bookA })).toBeVisible();

  const dialog = await openDeleteDialog(page);
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete my account" }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText("Your account was deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F074-account-deleted.png", { stylePath: "e2e/hide-dev-overlay.css" });

  // Signing in again with the same email and password fails.
  await page.getByLabel("Email").fill(emailA);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/sign-in/);

  // B's data is unchanged.
  await page.getByLabel("Email").fill(emailB);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("link", { name: bookB })).toBeVisible();
});
