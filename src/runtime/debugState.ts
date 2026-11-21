import type * as THREE from "three";
import type { MmdRuntimeDebugStageState, MmdRuntimeDebugState } from "./types.js";

function captureRuntimeDebugStage(mesh: THREE.SkinnedMesh): MmdRuntimeDebugStageState {
  return captureRuntimeDebugStageInto(mesh, createEmptyDebugStage());
}

function captureRuntimeDebugStageInto(
  mesh: THREE.SkinnedMesh,
  target: MmdRuntimeDebugStageState
): MmdRuntimeDebugStageState {
  mesh.updateWorldMatrix(false, true);
  extractMmdWorldMatricesInto(mesh, mutableNumberArray(target.worldMatricesColumnMajor));
  const morphWeights = mutableNumberArray(target.morphWeights);
  if (mesh.morphTargetInfluences) {
    copyArrayLikeToNumberArray(mesh.morphTargetInfluences, morphWeights);
  } else {
    morphWeights.length = 0;
  }
  return target;
}

function extractMmdWorldMatrices(mesh: THREE.SkinnedMesh): number[] {
  return extractMmdWorldMatricesInto(mesh, []);
}

function extractMmdWorldMatricesInto(mesh: THREE.SkinnedMesh, matrices: number[]): number[] {
  matrices.length = 0;
  for (const bone of mesh.skeleton.bones) {
    const elements = bone.matrixWorld.elements;
    for (let column = 0; column < 4; column += 1) {
      const columnSign = column === 2 ? -1 : 1;
      for (let row = 0; row < 4; row += 1) {
        const rowSign = row === 2 ? -1 : 1;
        matrices.push(rowSign * elements[column * 4 + row] * columnSign);
      }
    }
  }
  return matrices;
}

export function copyArrayLikeToNumberArray(values: ArrayLike<number>, target: number[]): number[] {
  target.length = values.length;
  for (let index = 0; index < values.length; index += 1) {
    target[index] = values[index];
  }
  return target;
}

function mutableNumberArray(values: readonly number[]): number[] {
  return values as number[];
}

function createEmptyDebugStage(): MmdRuntimeDebugStageState {
  return {
    worldMatricesColumnMajor: [],
    morphWeights: []
  };
}

function createEmptyDebugStages(): MmdRuntimeDebugState["stages"] {
  return {
    vmdInterpolation: createEmptyDebugStage(),
    appendTransform: createEmptyDebugStage(),
    ik: createEmptyDebugStage(),
    physics: createEmptyDebugStage()
  };
}

function cloneDebugStage(stage: MmdRuntimeDebugStageState): MmdRuntimeDebugStageState {
  return {
    worldMatricesColumnMajor: Array.from(stage.worldMatricesColumnMajor),
    morphWeights: Array.from(stage.morphWeights)
  };
}

export { captureRuntimeDebugStage, captureRuntimeDebugStageInto, cloneDebugStage, createEmptyDebugStage, createEmptyDebugStages, extractMmdWorldMatrices, extractMmdWorldMatricesInto };
