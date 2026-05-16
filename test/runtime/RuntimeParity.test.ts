import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import type * as THREE from "three";

import { ThreeMmdLoader } from "../../src/index.js";
import {
  compareWithOracle,
  createParityMetrics,
  extractMmdWorldMatrices,
  loadOracleDump
} from "../helpers/runtimeParity.js";
import type { MmdRuntime, ThreeMmdModel } from "../../src/index.js";

describe("DefaultMmdRuntime parity evidence", () => {
  it("matches the 1-bone cube oracle at frame 0 and stays bounded across all oracle frames", async () => {
    const oracle = loadOracleDump("test_1bone_cube_dump.json");
    const { model, runtime, clip } = await loadRuntimeFixture("test_1bone_cube.pmx", "test_1bone_cube_motion.vmd");
    const metrics = createParityMetrics();
    let frameZeroMaxAbsError = Number.POSITIVE_INFINITY;

    for (const frame of oracle.frames) {
      const stage = frame.stages.ik;
      if (!stage) {
        throw new Error(`Missing ik oracle stage for frame ${frame.frame}`);
      }

      runtime.reset(frame.seconds);
      runtime.setAnimation(clip, model.mesh);
      runtime.evaluate(frame.seconds);

      const candidate = extractMmdWorldMatrices(model.mesh);
      compareWithOracle(candidate, stage.worldMatricesColumnMajor, metrics, {
        frame: frame.frame,
        stage: "ik"
      });

      if (frame.frame === 0) {
        frameZeroMaxAbsError = maxAbsError(candidate, stage.worldMatricesColumnMajor);
      }
    }

    console.log("DefaultMmdRuntime 1-bone cube parity", {
      ...metrics,
      frameZeroMaxAbsError
    });

    expect(metrics.finite).toBe(true);
    expect(frameZeroMaxAbsError).toBeLessThanOrEqual(0.0001);
    expect(metrics.maxAbsError).toBeLessThan(1);
  });

  it("evaluates the append bone fixture without non-finite world matrices", async () => {
    const { model, runtime, clip } = await loadRuntimeFixture("test_append_bone.pmx", "test_append_bone.vmd");

    for (const seconds of [0, 0.5, 1.0]) {
      runtime.reset(seconds);
      runtime.setAnimation(clip, model.mesh);
      runtime.evaluate(seconds);

      expectAllFinite(extractMmdWorldMatrices(model.mesh));
    }
  });

  it("evaluates the joint orient fixture without non-finite world matrices", async () => {
    const { model, runtime, clip } = await loadRuntimeFixture("joint_orient_test.pmx", "joint_orient_test.vmd");

    for (const seconds of [0, 0.5, 1.0]) {
      runtime.reset(seconds);
      runtime.setAnimation(clip, model.mesh);
      runtime.evaluate(seconds);

      expectAllFinite(extractMmdWorldMatrices(model.mesh));
    }
  });
});

async function loadRuntimeFixture(modelFixture: string, motionFixture: string): Promise<{
  readonly model: ThreeMmdModel;
  readonly runtime: MmdRuntime;
  readonly clip: THREE.AnimationClip;
}> {
  const loader = new ThreeMmdLoader();
  const model = await loader.loadModel(await readFile(resolve("data", "unittest", modelFixture)));
  const animation = await loader.loadAnimation(await readFile(resolve("data", "unittest", motionFixture)), model);
  const runtime = model.runtime;
  const clip = animation.clip;

  if (!runtime) {
    throw new Error("Expected DefaultMmdRuntime");
  }
  if (!clip) {
    throw new Error("Expected animation clip");
  }

  return { model, runtime, clip };
}

function maxAbsError(candidate: readonly number[], oracle: readonly number[]): number {
  let result = 0;
  for (let index = 0; index < oracle.length; index += 1) {
    result = Math.max(result, Math.abs((candidate[index] ?? Number.NaN) - (oracle[index] ?? Number.NaN)));
  }
  return result;
}

function expectAllFinite(values: readonly number[]): void {
  for (const value of values) {
    expect(Number.isFinite(value)).toBe(true);
  }
}
