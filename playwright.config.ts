import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Local Supabase keys for the tests and the dev server (written by scripts/env-test.sh).
if (existsSync(".env.test")) process.loadEnvFile(".env.test");

// The loop gives each lane its own free PORT.
const port = Number(process.env.PORT ?? 3300);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // Visual baselines: toHaveScreenshot() images live in e2e/__screenshots__/ and are
  // committed. Rendering differs between macOS and Linux, so they are compared only
  // where agents run (this machine); CI skips them. Locally a missing baseline is
  // written, and a changed one fails until it is updated on purpose
  // (npx playwright test --update-snapshots=changed), which the designer reviews.
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  ignoreSnapshots: !!process.env.CI,
  updateSnapshots: process.env.CI ? "none" : "missing",
  // A cold dev server (always in CI) compiles a route or server action on first use,
  // which under parallel workers takes longer than the default 5s.
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  // Locally: the installed Google Chrome, so nothing has to be downloaded.
  // CI installs Chromium (npx playwright install --with-deps chromium).
  use: { baseURL: `http://localhost:${port}`, channel: process.env.CI ? undefined : "chrome" },
  webServer: {
    command: `npx next dev --port ${port}`,
    // This app's own route: another app on the same port answers 404, so
    // Playwright never mistakes it for this one and fails instead of testing it.
    url: `http://localhost:${port}/api/harness-health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
