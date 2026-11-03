# release-M2 log

## 2026-11-04 02:45 · passing
- Did: release gate for M2. This is the first release tag, so it covers M1 and M2: all 16 features (F001–F016) are passing. `./scripts/check.sh` passed on a clean tree. The verifier re-ran every feature against one shared dev server, each with its own headless Chromium, and all 16 returned PASS (evidence refreshed in `harness/evidence/`). A whole-repo security review found no high or medium issues. Wrote `docs/releases/M2.md` and tagged `M2-rc`.
- Staging: `scripts/deploy-staging.sh` exists but did not run. It needs `SUPABASE_PROJECT_REF`, `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, and none are set here (only `SUPABASE_ACCESS_TOKEN` is).
- Next session should know:
  - `harness/evidence/F013/` still has two stale screenshots from an older run (`step-00-empty-shelf.png`, `step-04a.png`); only a human may remove them.
  - Release notes list the non-blocking findings: no redirect away from /sign-in and /sign-up when signed in, rating arrow keys, Finished badge contrast, tab title on the not-found page.
  - Verifiers that take screenshots during hydration can trigger a React hydration warning about `caret-color: transparent`. It is a Playwright artifact, not an app bug.
