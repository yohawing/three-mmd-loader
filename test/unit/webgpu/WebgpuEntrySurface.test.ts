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
      "createMmdTslShadowCaster",
      "createMmdTslToonMaterial",
      "disposeMmdTslShadowCaster",
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
    expect(packageJson.scripts).toHaveProperty("bench:webgpu:sparse-morph");
    expect(readme).toContain("npm run visual:smoke:webgpu-poc");
    expect(readme).toContain("npm run visual:smoke:webgpu-poc:local");
    expect(readme).toContain("npm run bench:webgpu:sparse-morph -- --data-root <asset-root>");
    expect(readme).toContain("exports `@yohawing/three-mmd-loader/webgpu` as experimental");
  });

  it("keeps sparse morph benchmarking opt-in and native-WebGPU-only in the PoC", async () => {
    const poc = await readFile("examples/webgpu-poc/main.js", "utf8");

    expect(poc).toContain('const benchmarkMode = normalizeBenchmarkMode(params.get("benchmark"));');
    expect(poc).toContain('modelLoadOptions.morphAttributes = false;');
    expect(poc).toContain('enableMmdTslSparsePositionMorphs(model.mesh)');
    expect(poc).toContain('computeMmdTslSparsePositionMorphs(renderer, model.mesh);');
    expect(poc).toContain("window.__threeMmdWebgpuPocBenchmark = benchmarkHook;");
  });

  it("keeps local real-model comparison metrics thresholdable without max-only gating", async () => {
    const checker = await readFile("scripts/visual-regression/check-webgpu-poc.mjs", "utf8");

    expect(checker).toContain("pair.thresholds.p99 !== undefined");
    expect(checker).toContain("pair.thresholds.ratioGt10 !== undefined");
    expect(checker).toContain("pair.thresholds.ratioGt25 !== undefined");
    expect(checker).toContain("pair.thresholds.max !== undefined");
  });
});
