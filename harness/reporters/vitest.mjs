// Each unit test as it starts and ends, one JSON line in $HARNESS_TESTS, for the office's live test list
// (DESIGN.md 14.12). vitest.config.ts adds it only when the loop sets HARNESS_TESTS; it never fails a run.
import { appendFileSync } from "node:fs";

const write = row => {
  try { appendFileSync(process.env.HARNESS_TESTS, JSON.stringify({ runner: "unit", ...row }) + "\n"); } catch { /* never fail a run */ }
};
const file = t => (t.module?.moduleId ?? "").split("/").slice(-2).join("/");

export default class HarnessReporter {
  onTestRunStart() { write({ event: "run", status: "begin", ms: 0, name: "unit tests" }); }
  onTestCaseReady(t) { write({ event: "begin", name: t.fullName, file: file(t) }); }
  onTestCaseResult(t) {
    const state = t.result?.().state;
    write({ event: "end", name: t.fullName, file: file(t), status: state === "passed" ? "pass" : state === "skipped" ? "skip" : "fail",
            ms: Math.round(t.diagnostic?.()?.duration ?? 0) });
  }
  onTestRunEnd(_modules, errors, reason) { write({ event: "run", status: reason === "passed" && !errors?.length ? "pass" : "fail", ms: 0, name: "unit" }); }
}
