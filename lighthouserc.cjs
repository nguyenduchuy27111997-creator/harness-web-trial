// Performance budget (scripts/perf.sh, CI). Add each public page a feature builds to
// `pages`, and set the budgets from docs/design/<M>.md (NFR) when they differ.
const port = Number(process.env.PORT ?? 3300);
const pages = ["/", "/styleguide"];

module.exports = {
  ci: {
    collect: {
      startServerCommand: `npx next start --port ${port}`,
      startServerReadyPattern: "Ready",
      url: pages.map((p) => `http://localhost:${port}${p}`),
      numberOfRuns: 3, // one run on a CI runner scored 0.86 against 0.9 on an unchanged page
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "total-byte-weight": ["error", { maxNumericValue: 500000 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
