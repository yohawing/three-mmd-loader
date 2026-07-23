import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import {
  MmdRuntimeTransferablePosePool,
  MmdRuntimeWorkerHost,
  applyMmdRuntimePoseToMesh,
  copyMmdRuntimePoseInto,
  createMmdRuntimePoseApplyScratch,
  serializeMmdRuntimeModelDescriptor
} from "../../../src/worker/index.js";
import { extractMmdWorldMatrices } from "../../helpers/runtimeParity.js";

describe("transferable runtime poses", () => {
  it("applies a worker pose to a separate render skeleton", async () => {
    const bytes = await readFile(resolve("test/fixtures/test_append_bone.pmx"));
    const motionBytes = await readFile(resolve("test/fixtures/test_append_bone.vmd"));
    const loader = new ThreeMmdLoader();
    const source = await loader.loadModel(bytes);
    const target = await loader.loadModel(bytes);
    const animation = await loader.loadAnimation(motionBytes);
    const host = new MmdRuntimeWorkerHost(
      serializeMmdRuntimeModelDescriptor(source.mesh)
    );
    host.setAnimation(animation.animation);
    const pose = host.evaluate(0.5, { physics: false });

    const scratch = createMmdRuntimePoseApplyScratch(target.mesh);
    applyMmdRuntimePoseToMesh(pose, target.mesh, scratch);

    expectCloseArray(extractMmdWorldMatrices(target.mesh), pose.worldMatricesColumnMajor);
    expectCloseArray(target.mesh.morphTargetInfluences ?? [], pose.morphWeights);
    host.dispose();
  });

  it("reuses three transferable buffers and rejects duplicate returns", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const host = new MmdRuntimeWorkerHost(
      serializeMmdRuntimeModelDescriptor(model.mesh)
    );
    const pool = new MmdRuntimeTransferablePosePool(
      model.mesh.skeleton.bones.length,
      model.mesh.morphTargetInfluences?.length ?? 0
    );
    const first = pool.acquire();
    const second = pool.acquire();
    const third = pool.acquire();
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeDefined();
    expect(pool.acquire()).toBeUndefined();
    if (!first || !second || !third) {
      throw new Error("Expected three transferable pose buffers");
    }

    const sourcePose = host.evaluate(0.25);
    const returned = copyMmdRuntimePoseInto(sourcePose, first);
    expect(returned.sequence).toBe(sourcePose.sequence);
    expectCloseArray(returned.worldMatricesColumnMajor, sourcePose.worldMatricesColumnMajor);
    const transferred = structuredClone(returned, {
      transfer: [returned.worldMatricesColumnMajor.buffer, returned.morphWeights.buffer]
    });
    expect(returned.worldMatricesColumnMajor.byteLength).toBe(0);
    expect(pool.release(transferred)).toBe(true);
    expect(pool.release(transferred)).toBe(false);
    expect(pool.availableCount()).toBe(1);
    expect(pool.release(second)).toBe(true);
    expect(pool.release(third)).toBe(true);
    expect(pool.availableCount()).toBe(3);
    host.dispose();
  });
});

function expectCloseArray(candidate: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(candidate.length).toBe(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect(candidate[index]).toBeCloseTo(expected[index] ?? Number.NaN, 6);
  }
}
