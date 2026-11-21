import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// @ts-expect-error -- plain ESM script without type declarations
import { generateRootDeprecations } from "../../../scripts/generate-root-deprecations.mjs";

// @ts-expect-error -- plain ESM script without type declarations
import { buildPublicApiMembersReport, buildPublicApiReport } from "../../../scripts/api-report.mjs";

describe("public API report", () => {
  it("matches the reviewed snapshot of every package entry point", async () => {
    const report: string = buildPublicApiReport();
    const keep = JSON.parse(readFileSync("scripts/root-entry-keep.json", "utf8")) as { values: string[], types: string[] };
    const rows = report.split(/^## /m)[1].trim().split("\n").slice(1)
      .filter((line) => !line.includes("@deprecated")).map((line) => line.split(/\s+/));
    expect(rows.filter(([kind]) => !["type", "interface"].includes(kind)).map(([, name]) => name).sort()).toEqual(keep.values);
    expect(rows.filter(([kind]) => ["type", "interface", "class", "const+type", "enum"].includes(kind)).map(([, name]) => name).sort()).toEqual(keep.types);
    await expect(report).toMatchFileSnapshot("./public-api.report.txt");
  }, 120_000);

  it("keeps the generated root aliases and explicit re-exports in sync", () => {
    const { deprecated, index } = generateRootDeprecations();
    expect(readFileSync("src/root-deprecated.ts", "utf8").replaceAll("\r\n", "\n")).toBe(deprecated);
    expect(readFileSync("src/index.ts", "utf8").replaceAll("\r\n", "\n")).toBe(index);
  });

  it("matches the reviewed members of every package subpath", async () => {
    const report: string = buildPublicApiMembersReport();
    expect(report).not.toMatch(/\bimport\(["']/);
    await expect(report).toMatchFileSnapshot("./public-api.members.txt");
  }, 120_000);
});
