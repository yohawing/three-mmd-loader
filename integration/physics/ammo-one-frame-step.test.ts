import { describe, expect, it } from "vitest";

import { ThreeMmdLoader, createAmmoMmdPhysicsBackend } from "../../src/index.js";
import { parseLoaderMmdModelData } from "../../src/three/modelAssembly.js";
import { createMinimalStepContext, initAmmo } from "../helpers/ammoHelpers.js";
import { loadFixtureBytes } from "../helpers/fixtures.js";

describe("Ammo physics fixture integration", () => {
  it("steps one frame from a PMX-derived concrete context with finite output", async () => {
    const bytes = await loadFixtureBytes("test_basic_bone.pmx");
    const meshBytes = await loadFixtureBytes("test_1bone_cube.pmx");
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(meshBytes);
    const modelData = parseLoaderMmdModelData(bytes);
    const Ammo = await initAmmo();
    const backend = createAmmoMmdPhysicsBackend(Ammo);
    const context = createMinimalStepContext(
      modelData.skeleton,
      modelData.rigidBodies,
      modelData.joints
    );

    expect(model.mesh.isSkinnedMesh).toBe(true);

    backend.step(context);

    expect(Array.from(context.output?.translations ?? []).every(Number.isFinite)).toBe(true);
    expect(Array.from(context.output?.rotations ?? []).every(Number.isFinite)).toBe(true);

    backend.dispose?.();
    expect(backend.disposed).toBe(true);
  });
});
