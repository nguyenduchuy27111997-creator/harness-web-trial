import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

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
  // spinner) never does, so it is skipped. Transitions can start after the first wait (a color-scheme switch
  // starts the buttons' color fade late: F092's phone sheet failed on it in dark), so wait until a pass finds none.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const running = document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
        await Promise.all(running.map((a) => a.finished.catch(() => {})));
        return running.length;
      }),
    )
    .toBe(0);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

// The end of every UI feature's e2e test (docs/ui-guide.md): the final state in both color schemes, each checked
// by axe and saved as a visual baseline (<name>-light.png, <name>-dark.png), then touch targets at phone width.
// An app set up before app/ui-base.css (no --text-body on :root) has no dark tokens and no touch-target rules yet:
// it gets the light baseline only, until it adopts the guide.
export async function expectScreens(page: Page, name: string, options: { mask?: Locator[]; fullPage?: boolean } = {}) {
  const adopted = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--text-body").trim() !== "");
  for (const colorScheme of adopted ? (["light", "dark"] as const) : (["light"] as const)) {
    await page.emulateMedia({ colorScheme });
    await expectAccessible(page);
    await expect(page).toHaveScreenshot(`${name}-${colorScheme}.png`, options);
  }
  await page.emulateMedia({ colorScheme: null });
  if (adopted) await expectTouchTargets(page);
}

// Every control a finger uses is at least 44x44 CSS px at phone width (Apple HIG; WCAG 2.5.8 asks only 24).
// A link inside running text is exempt; a checkbox or radio counts its whole <label> row.
export async function expectTouchTargets(page: Page) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  const small = await page.evaluate(() => {
    const sel = "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], " +
      "[role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=combobox]";
    return [...document.querySelectorAll<HTMLElement>(sel)].flatMap((el) => {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || el.closest("[aria-hidden=true], nextjs-portal")) return [];
      if (el.tagName === "A" && style.display === "inline") return [];
      const r = (el.closest("label") ?? el).getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || (r.width >= 44 && r.height >= 44)) return []; // hidden or sr-only: not a target
      const what = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName.toLowerCase();
      return [`${what} (${Math.round(r.width)}x${Math.round(r.height)})`];
    });
  });
  if (size) await page.setViewportSize(size);
  expect(small, "controls smaller than 44x44 px at phone width").toEqual([]);
}
