import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import { DefaultMmdRuntime } from "../../../src/runtime/index.js";
import {
  MmdRuntimeWorkerHost,
  buildShadowMmdSkinnedMesh,
  isCurrentMmdRuntimePose,
  serializeMmdRuntimeModelDescriptor
} from "../../../src/worker/index.js";
import type { MmdRuntimeDebugState } from "../../../src/runtime/index.js";

describe("in-process MMD runtime worker host", () => {
  it("roundtrips the runtime model descriptor without sharing mutable metadata", async () => {
    const { model } = await loadFixture();
    const descriptor = serializeMmdRuntimeModelDescriptor(model.mesh);
    const shadow = buildShadowMmdSkinnedMesh(descriptor);

    expect(descriptor.version).toBe(1);
    expect(() => structuredClone(descriptor)).not.toThrow();
    expect(shadow.skeleton.bones).toHaveLength(model.mesh.skeleton.bones.length);
    expect(shadow.morphTargetInfluences).toHaveLength(
      model.mesh.morphTargetInfluences?.length ?? 0
    );
    for (let index = 0; index < descriptor.bones.length; index += 1) {
      const source = model.mesh.skeleton.bones[index];
      const candidate = shadow.skeleton.bones[index];
      expect(candidate?.name).toBe(source?.name);
      expect(candidate?.position.toArray()).toEqual(source?.position.toArray());
      expect(candidate?.quaternion.toArray()).toEqual(source?.quaternion.toArray());
      const sourceParentIndex = source?.parent
        ? model.mesh.skeleton.bones.findIndex((bone) => bone === source.parent)
        : -1;
      expect(descriptor.bones[index]?.parentIndex).toBe(sourceParentIndex);
    }

    const originalName = model.mesh.skeleton.bones[0]?.userData.mmdBoneName;
    const shadowBone = shadow.skeleton.bones[0];
    if (!shadowBone) {
      throw new Error("Expected shadow skeleton bone");
    }
    shadowBone.userData.mmdBoneName = "mutated-shadow";
    expect(model.mesh.skeleton.bones[0]?.userData.mmdBoneName).toBe(originalName);

    const invalidDescriptor = {
      ...descriptor,
      bones: descriptor.bones.map((bone, index) =>
        index === 0 ? { ...bone, parentIndex: descriptor.bones.length } : bone
      )
    };
    expect(() => buildShadowMmdSkinnedMesh(invalidDescriptor)).toThrow(
      "Invalid MMD runtime descriptor parent"
    );
  });

  it("matches inline runtime stages through ticks, seek, scrub, and physics toggles", async () => {
    for (const fixture of [
      ["test_1bone_cube.pmx", "test_1bone_cube_motion.vmd"],
      ["test_append_bone.pmx", "test_append_bone.vmd"]
    ] as const) {
      const { model, animation } = await loadFixture(...fixture);
      const direct = new DefaultMmdRuntime();
      const host = new MmdRuntimeWorkerHost(
        serializeMmdRuntimeModelDescriptor(model.mesh)
      );
      direct.setAnimation(animation, model.mesh);
      host.setAnimation(animation);

      evaluateAndCompare(direct, model.mesh, host, 0, { physics: false });
      evaluateAndCompare(direct, model.mesh, host, 0.15, { physics: true });
      direct.seek(0.75);
      host.seek(0.75);
      evaluateAndCompare(direct, model.mesh, host, 0.75, { physics: false });
      evaluateAndCompare(direct, model.mesh, host, 0.2, { physics: true });

      const pose = host.pose();
      const finalStage = host.debugState().stages.physics;
      expectCloseArray(pose.worldMatricesColumnMajor, finalStage.worldMatricesColumnMajor);
      expectCloseArray(pose.morphWeights, finalStage.morphWeights);
      host.dispose();
    }
  });

  it("invalidates stale poses with epochs and rejects work after dispose", async () => {
    const { model, animation } = await loadFixture();
    const host = new MmdRuntimeWorkerHost(
      serializeMmdRuntimeModelDescriptor(model.mesh)
    );

    const animationPose = host.setAnimation(animation);
    const animationEpoch = host.epoch();
    expect(isCurrentMmdRuntimePose(animationPose, animationEpoch)).toBe(true);
    const animationSequence = animationPose.sequence;

    host.seek(0.5);
    expect(host.epoch()).toBe(animationEpoch + 1);
    expect(isCurrentMmdRuntimePose(host.pose(), host.epoch(), animationSequence - 1)).toBe(false);

    const seekPose = host.evaluate(0.5);
    expect(isCurrentMmdRuntimePose(seekPose, host.epoch(), animationSequence)).toBe(true);
    const seekSequence = seekPose.sequence;
    const resetPose = host.resetPose();
    expect(resetPose.epoch).toBe(host.epoch());
    expect(resetPose.sequence).toBeGreaterThan(seekSequence);

    host.dispose();
    host.dispose();
    expect(() => host.evaluate(1)).toThrow("disposed");
  });
});

async function loadFixture(
  modelFixture = "test_1bone_cube.pmx",
  motionFixture = "test_1bone_cube_motion.vmd"
) {
  const loader = new ThreeMmdLoader();
  const model = await loader.loadModel(
    await readFile(resolve("test/fixtures", modelFixture))
  );
  const animation = await loader.loadAnimation(
    await readFile(resolve("test/fixtures", motionFixture))
  );
  return { model, animation: animation.animation };
}

function evaluateAndCompare(
  direct: DefaultMmdRuntime,
  directMesh: Parameters<DefaultMmdRuntime["setAnimation"]>[1],
  host: MmdRuntimeWorkerHost,
  seconds: number,
  options: { readonly physics: boolean }
): void {
  direct.evaluate(seconds, options);
  host.evaluate(seconds, options);
  expectDebugStateClose(host.debugState(), direct.debugState());
  expect(directMesh.skeleton.bones.length).toBe(host.mesh.skeleton.bones.length);
}

function expectDebugStateClose(
  candidate: MmdRuntimeDebugState,
  expected: MmdRuntimeDebugState
): void {
  for (const stage of ["vmdInterpolation", "appendTransform", "ik", "physics"] as const) {
    expectCloseArray(
      candidate.stages[stage].worldMatricesColumnMajor,
      expected.stages[stage].worldMatricesColumnMajor
    );
    expectCloseArray(
      candidate.stages[stage].morphWeights,
      expected.stages[stage].morphWeights
    );
  }
}

function expectCloseArray(candidate: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(candidate.length).toBe(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect(candidate[index]).toBeCloseTo(expected[index] ?? Number.NaN, 6);
  }
}
