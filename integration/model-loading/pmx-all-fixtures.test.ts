import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../src/index.js";
import { parseLoaderMmdModelData } from "../../src/three/modelAssembly.js";
import { PMX_FIXTURES, loadFixtureBytes } from "../helpers/fixtures.js";

describe("PMX fixture model loading", () => {
  it.each(PMX_FIXTURES)("%s loads into a Three.js skinned mesh", async (filename) => {
    const loader = new ThreeMmdLoader();
    const bytes = await loadFixtureBytes(filename);

    const modelData = parseLoaderMmdModelData(bytes);
    expect(modelData.metadata.format).toBe("pmx");
    expect(modelData.skeleton.bones.length).toBeGreaterThanOrEqual(1);

    const {
      mesh: { geometry, material, skeleton, isSkinnedMesh }
    } = await loader.loadModel(bytes);

    expect(isSkinnedMesh).toBe(true);
    expect(skeleton.bones.length).toBeGreaterThanOrEqual(1);
    if (filename === "test_fix_axis.pmx") {
      expect(geometry.index?.count ?? 0).toBe(0);
    } else {
      expect(geometry.index?.count ?? 0).toBe(modelData.geometry.indices.length);
    }
    if (Array.isArray(material)) {
      expect(material.length).toBeGreaterThanOrEqual(1);
    } else {
      expect(material).not.toBeNull();
    }
  });
});
