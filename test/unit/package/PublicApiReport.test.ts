import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM script without type declarations
import { buildPublicApiMembersReport, buildPublicApiReport } from "../../../scripts/api-report.mjs";

describe("public API report", () => {
  it("matches the reviewed snapshot of every package entry point", async () => {
    const report: string = buildPublicApiReport();
    await expect(report).toMatchFileSnapshot("./public-api.report.txt");
  }, 120_000);

  it("matches the reviewed members of every package subpath", async () => {
    const report: string = buildPublicApiMembersReport();
    expect(report).not.toMatch(/\bimport\(["']/);
    await expect(report).toMatchFileSnapshot("./public-api.members.txt");
  }, 120_000);
});
