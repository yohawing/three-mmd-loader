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
      "createMmdTslPipeline",
      "createMmdTslShadowCaster",
      "createMmdTslToonMaterial",
      "createModelLoadOptions",
      "disposeMmdTslShadowCaster",
      "disposeMmdTslSparsePositionMorphs",
      "enableMmdTslSparsePositionMorphs",
      "replaceMmdModelMaterialsWithTsl",
      "syncMmdTslMaterialState"
    ]);
  });
});
