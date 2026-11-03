import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Accessibility gate (WCAG 2.2 A/AA): every UI feature's e2e test calls this on each
// screen it checks. Serious and critical violations fail the test.
// It also fails on a runtime error in the page (an uncaught error, or console.error such as a
// hydration mismatch). Seen for real: Next's dev overlay badge ("1 Issue") was saved into a
// screenshot baseline instead of failing the test. A failed request (a 404 page) is not one.
export async function expectAccessible(page: Page) {
  const errors = [
    ...(await page.pageErrors()).map((e) => `pageerror: ${e.message}`),
    ...(await page.consoleMessages())
      .filter((m) => m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      .map((m) => `console.error: ${m.text()}`),
  ];
  expect(errors, "the page logged runtime errors").toEqual([]);
  // Next 16 streams metadata: right after a server action re-renders the page, <title> can be
  // briefly missing, and axe then reports document-title (a flaky main CI got two good features
  // reverted). Wait for the title; a page that never gets one still fails here.
  await expect(page, "the page has no <title>").toHaveTitle(/\S/);
  // Buttons use transition-all: right after a server action the submit button fades back from
  // disabled:opacity-50, and axe sampling it mid-fade reported color-contrast on a slow CI runner
  // (fixed this way in the web trial). Let running transitions finish first; an endless one (a
  // spinner) never does, so it is skipped.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}
