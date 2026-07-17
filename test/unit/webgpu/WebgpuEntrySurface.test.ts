import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import * as webgpuEntry from "../../../src/webgpu/index.js";

describe("experimental WebGPU TSL entry surface", () => {
  it("keeps the experimental entrypoint narrow", () => {
    expect(Object.keys(webgpuEntry).sort()).toEqual([
      "MMD_TSL_DEFAULT_LIGHT_COLOR",
      "MMD_TSL_DEFAULT_TOON_COORD_OFFSET",
      "appendMmdTslOutlineGroups",
      "computeMmdTslSparsePositionMorphs",
      "createMmdTslBaseColorNode",
      "createMmdTslMaterialFromSource",
      "createMmdTslReceivedShadowNode",
      "createMmdTslToonMaterial",
      "disposeMmdTslSparsePositionMorphs",
      "enableMmdTslSparsePositionMorphs",
      "replaceMmdModelMaterialsWithTsl",
      "syncMmdTslMaterialState"
    ]);
  });

  it("documents the WebGPU PoC verification scripts that package.json exposes", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const readme = await readFile("examples/webgpu-poc/README.md", "utf8");

    expect(packageJson.scripts).toHaveProperty("visual:smoke:webgpu-poc");
    expect(packageJson.scripts).toHaveProperty("visual:smoke:webgpu-poc:local");
    expect(readme).toContain("npm run visual:smoke:webgpu-poc");
    expect(readme).toContain("npm run visual:smoke:webgpu-poc:local");
    expect(readme).toContain("exports `@yohawing/three-mmd-loader/webgpu` as experimental");
  });

  it("keeps local real-model comparison metrics thresholdable without max-only gating", async () => {
    const checker = await readFile("scripts/visual-regression/check-webgpu-poc.mjs", "utf8");

    expect(checker).toContain("pair.thresholds.p99 !== undefined");
    expect(checker).toContain("pair.thresholds.ratioGt10 !== undefined");
    expect(checker).toContain("pair.thresholds.ratioGt25 !== undefined");
    expect(checker).toContain("pair.thresholds.max !== undefined");
  });
});
