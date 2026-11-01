/** Module boundaries, kept in step with docs/design/<M>.md (## Modules) by /design.
 *  Run by scripts/check.sh: `npx depcruise --config .dependency-cruiser.cjs .` */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", comment: "Modules must form a tree.", from: {}, to: { circular: true } },
    { name: "lib-not-app", severity: "error", comment: "lib/ must not import app/ (docs/design/M1.md, Modules).",
      from: { path: "^lib/" }, to: { path: "^app/" } },
    { name: "lib-not-components", severity: "error", comment: "lib/ must not import components/ (docs/design/M1.md, Modules).",
      from: { path: "^lib/" }, to: { path: "^components/" } },
    { name: "components-not-app", severity: "error", comment: "components/ must not import app/ (docs/design/M1.md, Modules).",
      from: { path: "^components/" }, to: { path: "^app/" } },
    { name: "components-not-supabase", severity: "error", comment: "components/ get data and actions as props, never a Supabase client (docs/design/M1.md, Modules).",
      from: { path: "^components/" }, to: { path: ["^lib/supabase/", "@supabase/"] } },
    { name: "ssr-only-in-lib-supabase", severity: "error", comment: "@supabase/ssr is imported only by lib/supabase/ (docs/design/M1.md, Modules).",
      from: { path: "^(app|components|lib)/", pathNot: "^lib/supabase/" }, to: { path: "@supabase/ssr" } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: ["^(app|lib|components|src)/", "^node_modules/@supabase/"], // @supabase/ so the rules above can see it
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
