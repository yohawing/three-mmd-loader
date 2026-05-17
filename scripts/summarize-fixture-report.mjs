#!/usr/bin/env node
// Summarize tmp/fixture-parse-report.json: list every failure, then group
// non-pass diagnostics by code so we can spot systemic issues.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const reportPath = resolve(__dirname, "..", "tmp", "fixture-parse-report.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));

console.log("Totals:", report.totals);

for (const [category, summary] of Object.entries(report.categories)) {
  console.log(
    `\n=== ${category.toUpperCase()} (total ${summary.total}, passed ${summary.passed}, failed ${summary.failed}) ===`
  );
  const fails = summary.files.filter((file) => file.status === "fail");
  const warnErrors = summary.files.filter((file) => file.status === "warn-errors");
  const warns = summary.files.filter((file) => file.status === "warn");

  if (fails.length > 0) {
    console.log(`-- Hard failures (${fails.length}) --`);
    for (const file of fails) {
      console.log(`  ${file.key} ${file.path}`);
      console.log(`    ${file.error.message}`);
    }
  }
  if (warnErrors.length > 0) {
    console.log(`-- Parsed but with error diagnostics (${warnErrors.length}) --`);
    for (const file of warnErrors) {
      console.log(`  ${file.key} ${file.path}`);
      for (const diagnostic of file.diagnostics ?? []) {
        if (diagnostic.level === "error") {
          console.log(`    error/${diagnostic.code}: ${diagnostic.message}`);
        }
      }
    }
  }
  if (warns.length > 0) {
    const codeCounts = new Map();
    for (const file of warns) {
      for (const diagnostic of file.diagnostics ?? []) {
        const key = `${diagnostic.level}/${diagnostic.code}`;
        codeCounts.set(key, (codeCounts.get(key) ?? 0) + 1);
      }
    }
    console.log(`-- Warnings only (${warns.length} files) by code --`);
    for (const [code, count] of [...codeCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${code}: ${count}`);
    }
  }
}
