import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { sampleMmdCameraTrackInto, ThreeMmdLoader } from "../../../src/index.js";
import type { CameraState } from "../../../src/parser/model/modelTypes.js";
import {
  compareNumberArrays,
  getOracleCamera,
  readNativeNanoemOracleDump
} from "../../helpers/nativeNanoemOracle.js";

const inventoryPath = "test/fixtures/fixtures.local.json";
const cameraKey = "addiction-one-person-camera";
const oraclePath = "test/fixtures/oracles/addiction-one-person-camera.local.json";
const cameraFixtures = await loadCameraFixtures();

describe("local native nanoem camera oracle", () => {
  if (cameraFixtures.skipReason) {
    it.skip(cameraFixtures.skipReason, () => {});
    return;
  }

  it(`matches ${cameraKey}`, async () => {
    const loader = new ThreeMmdLoader();
    const cameraMotion = await loader.loadAnimation(await readFile(cameraFixtures.cameraMotionPath));
    const oracle = await readNativeNanoemOracleDump(cameraFixtures.oraclePath);

    for (const { frame } of oracle.frames) {
      const expected = getOracleCamera(oracle, frame);
      if (expected === null) {
        throw new Error(`Camera oracle sample not found: frame=${frame}`);
      }
      const actual = sampleMmdCameraTrackInto(
        cameraMotion.animation.cameraFrames,
        frame,
        createCameraStateScratch()
      );
      if (!actual) {
        throw new Error(`Camera runtime sample not found: frame=${frame}`);
      }
      const comparison = compareNumberArrays(flattenCameraState(actual), flattenCameraState(expected), 1e-4);
      expect(comparison.ok, formatCameraMismatch(frame, comparison)).toBe(true);
    }
  });
});

async function loadCameraFixtures(): Promise<
  | { readonly skipReason: string }
  | { readonly cameraMotionPath: string; readonly oraclePath: string }
> {
  if (!(await fileExists(inventoryPath))) {
    return { skipReason: `local fixture inventory not found: ${inventoryPath}` };
  }
  if (!(await fileExists(oraclePath))) {
    return { skipReason: `local camera oracle not found: ${oraclePath}` };
  }

  const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as {
    readonly basePath?: string;
    readonly paths?: {
      readonly releaseSmoke?: {
        readonly byExtension?: {
          readonly cameraVmd?: Record<string, string>;
        };
      };
    };
  };
  const cameraPath = inventory.paths?.releaseSmoke?.byExtension?.cameraVmd?.[cameraKey];
  if (!cameraPath) {
    return { skipReason: `local camera fixture key not found: ${cameraKey}` };
  }

  const basePath = resolve(dirname(resolve(inventoryPath)), inventory.basePath ?? ".");
  const cameraMotionPath = resolve(basePath, cameraPath);
  if (!(await fileExists(cameraMotionPath))) {
    return { skipReason: `local camera fixture not found: ${cameraMotionPath}` };
  }

  return {
    cameraMotionPath,
    oraclePath: resolve(oraclePath)
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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

function formatCameraMismatch(
  frame: number,
  comparison: ReturnType<typeof compareNumberArrays>
): string {
  const worst = comparison.worst;
  return [
    `${cameraKey} frame=${frame} maxAbsError=${comparison.maxAbsError}`,
    worst
      ? `worst index=${worst.index} expected=${worst.expected} actual=${worst.actual} error=${worst.error}`
      : "no worst sample"
  ].join("; ");
}
