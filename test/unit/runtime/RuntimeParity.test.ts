import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import {
  compareWithOracle,
  createParityMetrics,
  extractMmdWorldMatrices,
  loadOracleDump
} from "../../helpers/runtimeParity.js";
import type { MmdRuntime, ThreeMmdModel } from "../../../src/index.js";
import type { MmdAnimation } from "../../../src/index.js";

describe("default runtime parity evidence", () => {
  it("matches the 1-bone cube oracle at frame 0 and stays bounded across all oracle frames", async () => {
    const oracle = loadOracleDump("test_1bone_cube_dump.json");
    const { model, runtime, animation } = await loadRuntimeFixture(
      "test_1bone_cube.pmx",
      "test_1bone_cube_motion.vmd"
    );
    const metrics = createParityMetrics();
    let frameZeroMaxAbsError = Number.POSITIVE_INFINITY;

    for (const frame of oracle.frames) {
      const stage = frame.stages.ik;
      if (!stage) {
        throw new Error(`Missing ik oracle stage for frame ${frame.frame}`);
      }

      runtime.reset(frame.seconds);
      runtime.setAnimation(animation, model.mesh);
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

    console.log("default runtime 1-bone cube parity", {
      ...metrics,
      frameZeroMaxAbsError
    });

    expect(metrics.finite).toBe(true);
    expect(frameZeroMaxAbsError).toBeLessThanOrEqual(0.0001);
    expect(metrics.maxAbsError).toBeLessThan(1);
  });

  it("evaluates the append bone fixture without non-finite world matrices", async () => {
    const { model, runtime, animation } = await loadRuntimeFixture(
      "test_append_bone.pmx",
      "test_append_bone.vmd"
    );

    for (const seconds of [0, 0.5, 1.0]) {
      runtime.reset(seconds);
      runtime.setAnimation(animation, model.mesh);
      runtime.evaluate(seconds);

      expectAllFinite(extractMmdWorldMatrices(model.mesh));
    }
  });

  it("exposes stage debug matrices for external runtime numeric evidence", async () => {
    const { model, runtime, animation } = await loadRuntimeFixture(
      "test_1bone_cube.pmx",
      "test_1bone_cube_motion.vmd"
    );

    runtime.reset(0);
    runtime.setAnimation(animation, model.mesh);
    runtime.evaluate(0.15);

    const debugState = runtime.debugState();
    const finalMatrices = extractMmdWorldMatrices(model.mesh);

    expect(debugState.stages.vmdInterpolation.worldMatricesColumnMajor).toHaveLength(finalMatrices.length);
    expect(debugState.stages.appendTransform.worldMatricesColumnMajor).toHaveLength(finalMatrices.length);
    expect(debugState.stages.ik.worldMatricesColumnMajor).toHaveLength(finalMatrices.length);
    expect(debugState.stages.physics.worldMatricesColumnMajor).toEqual(finalMatrices);

    const mutableStage = debugState.stages.physics.worldMatricesColumnMajor as number[];
    mutableStage[0] = 999;
    expect(runtime.debugState().stages.physics.worldMatricesColumnMajor[0]).toBe(finalMatrices[0]);
  });

  it("evaluates the joint orient fixture without non-finite world matrices", async () => {
    const { model, runtime, animation } = await loadRuntimeFixture(
      "joint_orient_test.pmx",
      "joint_orient_test.vmd"
    );

    for (const seconds of [0, 0.5, 1.0]) {
      runtime.reset(seconds);
      runtime.setAnimation(animation, model.mesh);
      runtime.evaluate(seconds);

      expectAllFinite(extractMmdWorldMatrices(model.mesh));
    }
  });
});

async function loadRuntimeFixture(modelFixture: string, motionFixture: string): Promise<{
  readonly model: ThreeMmdModel;
  readonly runtime: MmdRuntime;
  readonly animation: MmdAnimation;
}> {
  const loader = new ThreeMmdLoader();
  const model = await loader.loadModel(await readFile(resolve("test/fixtures", modelFixture)));
  const animation = await loader.loadAnimation(await readFile(resolve("test/fixtures", motionFixture)));
  const runtime = model.runtime;

  if (!runtime) {
    throw new Error("Expected runtime");
  }

  return { model, runtime, animation: animation.animation };
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
