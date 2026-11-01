import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Accessibility gate (WCAG 2.2 A/AA): every UI feature's e2e test calls this on each
// screen it checks. Serious and critical violations fail the test.
export async function expectAccessible(page: Page) {
  // Next 16 streams metadata: right after a server action re-renders the page, <title> can be
  // briefly missing, and axe then reports document-title (a flaky main CI got two good features
  // reverted). Wait for the title; a page that never gets one still fails here.
  await expect(page, "the page has no <title>").toHaveTitle(/\S/);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}
