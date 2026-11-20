import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectScreens } from "./a11y";
import { signUpAs } from "./accounts";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
const addLink = (page: Page) => page.getByRole("main").getByRole("link", { name: "Add book", exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Add book" });

for (const [name, viewport] of [
  ["computer", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 844 }],
] as const) {
  test(`on a ${name} the add sheet puts focus in the lookup field`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signUpAs(page, `f092-focus-${name}-${stamp()}@example.com`);
    await page.goto("/books");
    await addLink(page).first().click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).locator("#lookup")).toBeFocused();
    await expectAccessible(page);
    await expectScreens(page, `F092-add-sheet-focus-${name}`);
  });
}
