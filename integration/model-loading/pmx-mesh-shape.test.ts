import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../src/index.js";
import { loadFixtureBytes } from "../helpers/fixtures.js";

describe("PMX mesh shape integration fixture", () => {
  it("loads test_1bone_cube.pmx with the expected hard-coded dump shape", async () => {
    const loader = new ThreeMmdLoader();
    const bytes = await loadFixtureBytes("test_1bone_cube.pmx");

    const model = await loader.loadModel(bytes);
    const { mesh } = model;

    expect(mesh.isSkinnedMesh).toBe(true);
    expect(mesh.skeleton.bones.length).toBe(1);
    expect(mesh.geometry.getAttribute("position").count).toBe(14);
    expect(mesh.geometry.index?.count).toBe(36);
    expect(mesh.userData.mmdModel.format).toBe("pmx");
    expect(model.runtime).toBeDefined();
  });
});
