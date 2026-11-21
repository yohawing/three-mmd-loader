import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM script without type declarations
import { buildPublicApiReport } from "../../../scripts/api-report.mjs";

describe("public API report", () => {
  it("matches the reviewed snapshot of every package entry point", async () => {
    const report: string = buildPublicApiReport();
    await expect(report).toMatchFileSnapshot("./public-api.report.txt");
  }, 120_000);
});
