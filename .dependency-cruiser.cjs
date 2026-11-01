/** Module boundaries, kept in step with docs/design/<M>.md (## Modules) by /design.
 *  Run by scripts/check.sh: `npx depcruise --config .dependency-cruiser.cjs .` */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", comment: "Modules must form a tree.", from: {}, to: { circular: true } },
    // /design adds one rule per import the design forbids, for example:
    // { name: "lib-not-app", severity: "error", comment: "lib/ must not import pages (docs/design/M1.md, Modules).",
    //   from: { path: "^lib/" }, to: { path: "^app/" } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: "^(app|lib|components|src)/",
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
