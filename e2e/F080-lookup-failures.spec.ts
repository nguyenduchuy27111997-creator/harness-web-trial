import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;

// Fixture queries (e2e/fixtures/lookup.json): "slow book" times out, "broken book" is refused;
// any key missing from the fixture is not found.
// Names: 'Look up' field and button as in F079; "Save" is the add form's button.
async function lookUp(page: Page, query: string) {
  await page.goto("/books/new");
  await page.getByRole("textbox", { name: "Look up" }).fill(query);
  await page.getByRole("button", { name: "Look up", exact: true }).click();
}

// The fields stay editable and a book typed by hand saves.
async function saveByHand(page: Page) {
  const title = `Handmade ${stamp()}`;
  await expect(page.getByLabel("Title")).toBeEditable();
  await expect(page.getByLabel("Author")).toBeEditable();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Author").fill("Hand Author");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole("listitem").filter({ hasText: title })).toContainText("Hand Author");
}

test("a timeout says to enter the book by hand, and a hand-typed book saves", async ({ page }) => {
  await signUpAs(page, `f080a-${stamp()}@example.com`);
  await lookUp(page, "slow book");
  await expect(page.getByText("Lookup timed out, enter the book by hand")).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F080-lookup-timeout.png");
  await saveByHand(page);
});

test("nothing found names the query, and a hand-typed book saves", async ({ page }) => {
  await signUpAs(page, `f080b-${stamp()}@example.com`);
  await lookUp(page, "zzz no such book");
  await expect(page.getByText("No book found for zzz no such book")).toBeVisible();
  await expectAccessible(page);
  await saveByHand(page);
});

test("a refused lookup says it is not available, and a hand-typed book saves", async ({ page }) => {
  await signUpAs(page, `f080c-${stamp()}@example.com`);
  await lookUp(page, "broken book");
  await expect(page.getByText("Lookup is not available right now")).toBeVisible();
  await expectAccessible(page);
  await saveByHand(page);
});
