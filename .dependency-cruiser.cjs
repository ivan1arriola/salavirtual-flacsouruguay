/** Architectural rules for the Next.js application. */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    { name: "no-orphans", severity: "warn", from: { orphan: true, pathNot: "(^|/)index\\." }, to: {} },
    { name: "no-deprecated-core", severity: "error", from: {}, to: { dependencyTypes: ["core"], path: "^(punycode|domain)$" } }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    exclude: "(^|/)(node_modules|\\.next|coverage|generated)/"
  }
};
