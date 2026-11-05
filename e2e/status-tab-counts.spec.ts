import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";

// F039: each status tab shows how many books it has, following search and status changes. Fresh account (golden principle 7).
test("status tabs show their book counts", async ({ page }) => {
  const tag = `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
  await signUpAs(page, `f039-${tag}@example.com`);
  const books = [
    ["Alpha Want", "Want to read"],
    ["Beta Want", "Want to read"],
    ["Alpha Reading", "Reading"],
    ["Alpha Done", "Finished"],
    ["Beta Done", "Finished"],
    ["Gamma Done", "Finished"],
  ];
  for (const [title, status] of books) {
    await page.goto("/books/new");
    for (const [label, value] of [["Title", title], ["Author", "Some Author"]]) await page.getByLabel(label).fill(value);
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: status }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/books$/);
  }

  const tabs = page.getByRole("navigation", { name: "Book filter" });
  const expectCounts = async (all: number, want: number, reading: number, finished: number) => {
    await expect(tabs.getByRole("link", { name: `All (${all})`, exact: true })).toBeVisible();
    await expect(tabs.getByRole("link", { name: `Want to read (${want})`, exact: true })).toBeVisible();
    await expect(tabs.getByRole("link", { name: `Reading (${reading})`, exact: true })).toBeVisible();
    await expect(tabs.getByRole("link", { name: `Finished (${finished})`, exact: true })).toBeVisible();
  };
  await expectCounts(6, 2, 1, 3);

  // The counts do not change with the selected tab.
  await tabs.getByRole("link", { name: "Finished (3)" }).click();
  await expect(page).toHaveURL(/status=finished/);
  await expectCounts(6, 2, 1, 3);

  // Only the books the search shows are counted.
  await page.goto("/books?q=alpha");
  await expectCounts(3, 1, 1, 1);

  // Reading to Finished, also after reload.
  await page.goto("/books?status=reading");
  await page.getByRole("listitem").filter({ hasText: "Alpha Reading" }).getByRole("link").first().click();
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Finished" }).click();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText(/Finished on/)).toBeVisible();
  await page.goto("/books");
  await expectCounts(6, 2, 0, 4);
  await page.reload();
  await expectCounts(6, 2, 0, 4);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F039-tab-counts.png");
});
