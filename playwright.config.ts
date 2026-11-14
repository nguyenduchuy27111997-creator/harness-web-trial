import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Local Supabase keys for the tests and the dev server (written by scripts/env-test.sh).
if (existsSync(".env.test")) process.loadEnvFile(".env.test");

// Book lookups answer from this fixture in every test (never Open Library); the dev server inherits it.
process.env.BOOK_LOOKUP_FIXTURE ??= "e2e/fixtures/lookup.json";

// The loop gives each lane its own free PORT.
const port = Number(process.env.PORT ?? 3300);
// Playwright's Linux browser server (scripts/browser.sh), set by scripts/e2e.sh.
const ws = process.env.PW_WS;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // In CI a failed test runs once more before it fails the run. In the web trial most red runs after a local PASS
  // were e2e tests timing out on a busy shared machine, and each cost a whole rerun of the job (about 20 minutes
  // with the queue for one runner). Playwright reports a test that passed on its retry as flaky.
  retries: process.env.CI ? 1 : 0,
  // In the loop, each test also goes to the office's live test list (harness/reporters/, $HARNESS_TESTS).
  reporter: process.env.HARNESS_TESTS ? [["list"], ["./harness/reporters/playwright.mjs"]] : undefined,
  // Visual baselines: toHaveScreenshot() images live in e2e/__screenshots__/ and are committed. They render in
  // Playwright's Linux browser in Docker (scripts/browser.sh, via scripts/e2e.sh, which sets PW_WS), on this
  // machine and on CI alike, so they are the same pixels everywhere and compared everywhere. A plain
  // `npx playwright test` without PW_WS uses this machine's browser and skips them. Locally a missing baseline
  // is written, and a changed one fails until it is updated on purpose
  // (scripts/e2e.sh --update-snapshots=changed), which the designer reviews.
  // No pixel tolerance: one renderer draws the same pixels every run, and in the web trial a
  // 1% tolerance let a new header and restyled tabs (0.6% of a page) pass on stale baselines.
  // screenshot.css hides Next's dev badge, which shows even with devIndicators: false.
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  ignoreSnapshots: !ws,
  updateSnapshots: process.env.CI ? "none" : "missing",
  // A cold dev server (always in CI) compiles a route or server action on first use,
  // which under parallel workers takes longer than the default 5s.
  expect: { timeout: 15_000, toHaveScreenshot: { animations: "disabled", stylePath: "./e2e/screenshot.css" } },
  // With PW_WS: the Docker browser, which reaches this machine's localhost (the app, Supabase) through
  // Playwright's tunnel. Without it: locally the installed Google Chrome, on CI the installed Chromium.
  use: {
    baseURL: `http://localhost:${port}`,
    ...(ws
      ? { connectOptions: { wsEndpoint: ws, exposeNetwork: "<loopback>" } }
      : { channel: process.env.CI ? undefined : "chrome" }),
  },
  webServer: {
    command: `npx next dev --port ${port}`,
    // This app's own route: another app on the same port answers 404, so
    // Playwright never mistakes it for this one and fails instead of testing it.
    url: `http://localhost:${port}/api/harness-health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
