import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { sampleMmdCameraTrackInto, ThreeMmdLoader } from "../../../src/index.js";
import type { CameraState } from "../../../src/parser/model/modelTypes.js";
import { loadLocalPlaybackFixtures } from "../../helpers/localPlaybackFixtures.js";
import {
  compareNumberArrays,
  extractMmdWorldBoneMatrix,
  findOracleBoneIndex,
  getOracleCamera,
  getOracleBoneMatrix,
  getOracleStage,
  readNativeNanoemOracleDump
} from "../../helpers/nativeNanoemOracle.js";

const playbackFixtures = await loadLocalPlaybackFixtures();

describe("local native nanoem playback oracle", () => {
  if (playbackFixtures.skipReason) {
    it.skip(playbackFixtures.skipReason, () => {});
    return;
  }

  for (const skippedCase of playbackFixtures.skippedCases) {
    it.skip(`${skippedCase.name}: ${skippedCase.reason}`, () => {});
  }

  for (const playbackCase of playbackFixtures.cases) {
    it(`matches ${playbackCase.name}`, async () => {
      const loader = new ThreeMmdLoader({ runtime: { frameRate: 30, physics: "none" } });
      const model = await loader.loadModel(await readFile(playbackCase.modelPath));
      const motion = await loader.loadAnimation(await readFile(playbackCase.motionPath));
      const cameraMotion =
        playbackCase.cameraMotionPath === undefined
          ? undefined
          : await loader.loadAnimation(await readFile(playbackCase.cameraMotionPath));
      const oracle = await readNativeNanoemOracleDump(playbackCase.oraclePath);
      const runtime = model.runtime;
      if (!runtime) {
        throw new Error("ThreeMmdLoader did not create a runtime");
      }

      runtime.setAnimation(motion.animation, model.mesh);

      for (const frame of playbackCase.frames) {
        runtime.evaluate(frame / 30, { physics: false });
        model.mesh.updateWorldMatrix(false, true);

        for (const boneName of playbackCase.watchBones) {
          const boneIndex = findOracleBoneIndex(oracle, boneName);
          const actual = extractMmdWorldBoneMatrix(model.mesh, boneIndex);
          const expected = getOracleBoneMatrix(oracle, frame, playbackCase.stage, boneName);
          const comparison = compareNumberArrays(actual, expected, playbackCase.matrixEpsilon);

          expect(comparison.ok, formatMatrixMismatch(playbackCase.name, frame, boneName, comparison)).toBe(
            true
          );
        }

        const expectedCamera = getOracleCamera(oracle, frame);
        if (cameraMotion !== undefined && expectedCamera !== null) {
          const actualCamera = sampleMmdCameraTrackInto(
            cameraMotion.animation.cameraFrames,
            frame,
            createCameraStateScratch()
          );
          if (!actualCamera) {
            throw new Error(`${playbackCase.name} frame=${frame} camera sample not found`);
          }
          const cameraComparison = compareNumberArrays(
            flattenCameraState(actualCamera),
            flattenCameraState(expectedCamera),
            playbackCase.cameraEpsilon
          );
          expect(
            cameraComparison.ok,
            formatCameraMismatch(playbackCase.name, frame, cameraComparison)
          ).toBe(true);
        }

        const expectedMorphWeights = getOracleStage(
          oracle,
          frame,
          playbackCase.stage
        ).morphWeights;
        if (expectedMorphWeights.length > 0) {
          const actualMorphWeights = Array.from(model.mesh.morphTargetInfluences ?? []);
          const morphComparison = compareNumberArrays(
            actualMorphWeights,
            expectedMorphWeights,
            playbackCase.morphEpsilon
          );
          expect(
            morphComparison.ok,
            formatMorphMismatch(playbackCase.name, frame, morphComparison)
          ).toBe(true);
        }
      }
    });
  }
});

function createCameraStateScratch(): CameraState {
  return {
    distance: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    fov: 1,
    perspective: true
  };
}

function flattenCameraState(camera: {
  readonly distance: number;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly fov: number;
  readonly perspective: boolean;
}): readonly number[] {
  return [
    camera.distance,
    ...camera.position,
    ...camera.rotation,
    camera.fov,
    camera.perspective ? 1 : 0
  ];
}

function formatMatrixMismatch(
  caseName: string,
  frame: number,
  boneName: string,
  comparison: ReturnType<typeof compareNumberArrays>
): string {
  const worst = comparison.worst;
  return [
    `${caseName} frame=${frame} bone=${boneName} maxAbsError=${comparison.maxAbsError}`,
    worst
      ? `worst index=${worst.index} expected=${worst.expected} actual=${worst.actual} error=${worst.error}`
      : "no worst sample"
  ].join("; ");
}

function formatCameraMismatch(
  caseName: string,
  frame: number,
  comparison: ReturnType<typeof compareNumberArrays>
): string {
  const worst = comparison.worst;
  return [
    `${caseName} frame=${frame} camera maxAbsError=${comparison.maxAbsError}`,
    worst
      ? `worst index=${worst.index} expected=${worst.expected} actual=${worst.actual} error=${worst.error}`
      : "no worst sample"
  ].join("; ");
}

function formatMorphMismatch(
  caseName: string,
  frame: number,
  comparison: ReturnType<typeof compareNumberArrays>
): string {
  const worst = comparison.worst;
  return [
    `${caseName} frame=${frame} morphWeights maxAbsError=${comparison.maxAbsError}`,
    worst
      ? `worst index=${worst.index} expected=${worst.expected} actual=${worst.actual} error=${worst.error}`
      : "no worst sample"
  ].join("; ");
}
