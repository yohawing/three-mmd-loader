import type * as THREE from "three";
import type { MmdDirectBufferPhysicsBackend, MmdPhysicsBackend, MmdPhysicsStepBuffers } from "../physics/index.js";
import type { RuntimeExternalPhysicsData } from "./types.js";

const mmdMatrixAxisSigns = [1, 1, -1, 1] as const;

export function ensureTuple3ScratchLength(
  scratch: Array<[number, number, number]>,
  length: number
): Array<[number, number, number]> {
  for (let index = scratch.length; index < length; index += 1) {
    scratch.push([0, 0, 0]);
  }
  scratch.length = length;
  return scratch;
}

export function resetDirectUpdatedBoneIndices(
  target: MmdPhysicsStepBuffers["updatedBoneIndices"] | undefined
): MmdPhysicsStepBuffers["updatedBoneIndices"] | undefined {
  if (Array.isArray(target)) {
    target.length = 0;
  }
  return target;
}

export function acquireDirectStepBuffersIfPossible(
  backend: MmdPhysicsBackend,
  data: RuntimeExternalPhysicsData,
  boneCount: number
): MmdPhysicsStepBuffers | undefined {
  if (!isDirectBufferPhysicsBackend(backend) || requiresPrePhysicsRestPose(data)) {
    return undefined;
  }
  const buffers = backend.acquireStepBuffers({
    boneCount,
    translationValueCount: boneCount * 3,
    rotationValueCount: boneCount * 4,
    worldMatrixValueCount: boneCount * 16
  });
  return buffers && hasDirectStepBufferCapacity(buffers, boneCount) ? buffers : undefined;
}

function isDirectBufferPhysicsBackend(
  backend: MmdPhysicsBackend
): backend is MmdDirectBufferPhysicsBackend {
  return typeof (backend as { acquireStepBuffers?: unknown }).acquireStepBuffers === "function";
}

function requiresPrePhysicsRestPose(data: RuntimeExternalPhysicsData): boolean {
  for (const bone of data.skeleton.bones) {
    if (bone.transformAfterPhysics === true) {
      return true;
    }
  }
  return false;
}

function hasDirectStepBufferCapacity(buffers: MmdPhysicsStepBuffers, boneCount: number): boolean {
  return (
    buffers.inputTranslations.length >= boneCount * 3 &&
    buffers.inputRotations.length >= boneCount * 4 &&
    buffers.inputWorldMatricesColumnMajor.length >= boneCount * 16 &&
    buffers.outputTranslations.length >= boneCount * 3 &&
    buffers.outputRotations.length >= boneCount * 4 &&
    buffers.outputWorldMatricesColumnMajor.length >= boneCount * 16 &&
    buffers.bonePhysicsToggles.length >= boneCount &&
    (buffers.updatedBoneIndices === undefined || buffers.updatedBoneIndices.length >= boneCount)
  );
}

export function extractMmdWorldMatricesIntoFloat32(
  mesh: THREE.SkinnedMesh,
  matrices: Float32Array<ArrayBuffer>
): Float32Array<ArrayBuffer> {
  for (let boneIndex = 0; boneIndex < mesh.skeleton.bones.length; boneIndex += 1) {
    const bone = mesh.skeleton.bones[boneIndex];
    const elements = bone.matrixWorld.elements;
    const base = boneIndex * 16;
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        matrices[base + column * 4 + row] =
          mmdMatrixAxisSigns[row] * elements[column * 4 + row] * mmdMatrixAxisSigns[column];
      }
    }
  }
  return matrices;
}
