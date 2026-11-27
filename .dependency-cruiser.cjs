/** Architectural rules for the Next.js application. */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: { path: "^(app|src)/" },
      to: {
        circular: true,
        dependencyTypesNot: ["type-only", "pre-compilation-only"],
        viaOnly: { dependencyTypesNot: ["type-only", "pre-compilation-only"] }
      }
    },
    {
      name: "no-orphans",
      severity: "error",
      from: {
        orphan: true,
        path: "^(app|src)/",
        pathNot: [
          "(^|/)index\\.",
          "\\.d\\.ts$",
          "^(?:app|app/.*)/(?:page|layout|route|template|loading|error|not-found|default|manifest|robots|sitemap)\\."
        ]
      },
      to: {}
    },
    {
      name: "no-unresolved",
      severity: "error",
      from: { path: "^(app|src|scripts|test)/" },
      to: { couldNotResolve: true }
    },
    {
      name: "no-deprecated-core",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["core"], path: "^(punycode|domain)$" }
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: "specify",
    exclude: "(^|/)(node_modules|\\.next|coverage|generated|legacy-meetings)/"
  }
};
