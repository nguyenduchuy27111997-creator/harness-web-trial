// Each e2e test as it starts and ends, one JSON line in $HARNESS_TESTS, for the office's live test list
// (DESIGN.md 14.12). playwright.config.ts adds it only when the loop sets HARNESS_TESTS; it never fails a run.
import { appendFileSync } from "node:fs";

const write = row => {
  try { appendFileSync(process.env.HARNESS_TESTS, JSON.stringify({ runner: "e2e", ...row }) + "\n"); } catch { /* never fail a run */ }
};
const name = test => test.titlePath().filter(Boolean).slice(1).join(" › ");
const file = test => test.location.file.split("/").slice(-2).join("/");

export default class HarnessReporter {
  onBegin(_config, suite) { write({ event: "run", status: "begin", ms: 0, name: `${suite.allTests().length} e2e tests` }); }
  onTestBegin(test) { write({ event: "begin", name: name(test), file: file(test) }); }
  onTestEnd(test, result) {
    write({ event: "end", name: name(test), file: file(test),
            status: result.status === "passed" ? "pass" : result.status === "skipped" ? "skip" : "fail", ms: result.duration });
  }
  onEnd(result) { write({ event: "run", status: result.status === "passed" ? "pass" : "fail", ms: 0, name: "e2e" }); }
  printsToStdio() { return false; }
}
