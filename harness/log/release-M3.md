# release-M3 log

## 2026-11-05 · passing
- Did: release gate for M3. All 7 M3 features (F018–F024) are passing. `./scripts/check.sh` passed on a clean tree (27 e2e tests). The verifier re-ran all 24 features from M1–M3, one at a time against one dev server on port 3300, and all 24 returned PASS. Evidence is refreshed in `harness/evidence/`, plus a new `F017/step-04b.png`. A security review of `M2-rc..HEAD` found no high or medium issues. Wrote `docs/releases/M3.md` and tagged `M3-rc`.
- Staging: skipped by the human's choice (they declined the Supabase/Vercel cost). `scripts/deploy-staging.sh` was not run.
- Next session should know:
  - Non-blocking findings the verifiers reproduced are candidates for `/bug`: hidden previous routes stay in the DOM (duplicate `main` and input ids, doubled accessible names such as "Status Status"); two "Save" buttons on the book page while editing; no Cancel on Change goal.
  - F013 stale list after Back was seen once and not reproduced. It is listed as Unconfirmed.
