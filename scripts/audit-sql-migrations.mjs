import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2];
const paths = base
  ? execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", base, "HEAD", "--", "prisma/migrations"], {
      encoding: "utf8"
    })
  : execFileSync("git", ["ls-files", "prisma/migrations"], { encoding: "utf8" });

const rules = [
  ["DROP", /\bDROP\s+(?:TABLE|COLUMN|SCHEMA|TYPE|INDEX)\b/i],
  ["TRUNCATE", /\bTRUNCATE\b/i],
  ["DELETE", /\bDELETE\s+FROM\b/i],
  ["NOT_NULL", /\bSET\s+NOT\s+NULL\b/i],
  ["TYPE_CHANGE", /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i]
];

const findings = [];
for (const path of paths.split("\n").filter((p) => p.endsWith("/migration.sql"))) {
  const sql = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
  for (const [rule, pattern] of rules) {
    if (pattern.test(sql)) {
      findings.push({ path, rule });
    }
  }
}
console.log(JSON.stringify({ scope: base ? "changes" : "inventory", findings }, null, 2));
