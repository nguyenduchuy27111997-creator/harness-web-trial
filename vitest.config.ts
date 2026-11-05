import { defineConfig } from "vitest/config";

// Unit tests cover logic in lib/; pages and flows are covered by e2e/ (Playwright).
export default defineConfig({
  test: {
    // In the loop, each test also goes to the office's live test list (harness/reporters/, $HARNESS_TESTS).
    reporters: process.env.HARNESS_TESTS ? ["default", "./harness/reporters/vitest.mjs"] : undefined,
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    coverage: {
      provider: "v8",
      // In the loop, a json summary too: harness/quality.py reads it for the office ($HARNESS_QUALITY).
      reporter: process.env.HARNESS_QUALITY ? ["text", "json-summary"] : undefined,
      include: ["lib/**/*.ts"],
      exclude: ["**/*.test.ts", "lib/supabase/**"], // Supabase/cookie glue: covered by e2e (docs/design/M1.md)
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
