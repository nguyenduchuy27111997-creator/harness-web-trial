import { test, expect } from "@playwright/test";

// Guards the e2e setup itself: the server under test is this app.
test("health route names this app", async ({ request }) => {
  const res = await request.get("/api/harness-health");
  expect(res.ok()).toBe(true);
  expect((await res.json()).app).toBe("__APP_NAME__");
});
