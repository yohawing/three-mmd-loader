import type * as THREE from "three";
import type { MmdPhysicsBackend, MmdPhysicsStepContext } from "../physics/index.js";
import { ensureFloat32ArrayLength, prepareQuaternionScratchArray, prepareVector3ScratchArray, writeQuaternionToBuffer } from "./math.js";
import type { MmdFrameState } from "./types.js";

function createPhysicsResetContext(
  state: MmdFrameState
): NonNullable<Parameters<NonNullable<MmdPhysicsBackend["reset"]>>[0]> {
  return {
    seconds: state.seconds,
    frame: state.frame,
    frameRate: state.frameRate
  };
}

interface PrePhysicsScratch {
  preTranslations: Float32Array;
  preRotations: Float32Array;
  preWorldMatricesColumnMajor: Float32Array;
  readonly composeWorldPositions: THREE.Vector3[];
  readonly composeWorldRotations: THREE.Quaternion[];
  readonly composeMatrix: THREE.Matrix4;
  readonly composeUnitScale: THREE.Vector3;
  readonly mergeTargetRotation: THREE.Quaternion;
  readonly mergePreRotation: THREE.Quaternion;
  readonly mergePhysicsRotation: THREE.Quaternion;
  readonly localPosition: THREE.Vector3;
  readonly localRotation: THREE.Quaternion;
}

function transformsAfterPhysics(bone: NonNullable<MmdPhysicsStepContext["skeleton"]>["bones"][number]): boolean {
  return bone.transformAfterPhysics === true;
}

const identityRotation = [0, 0, 0, 1] as const;

function createPrePhysicsInputBuffersIfNeeded(
  skeleton: NonNullable<MmdPhysicsStepContext["skeleton"]>,
  translations: Float32Array,
  rotations: Float32Array,
  fallbackWorldMatricesColumnMajor: Float32Array,
  scratch: PrePhysicsScratch
): PrePhysicsScratch | undefined {
  if (!skeleton.bones.some(transformsAfterPhysics)) {
    return undefined;
  }
  const preTranslations = ensureFloat32ArrayLength(scratch.preTranslations, translations.length);
  scratch.preTranslations = preTranslations;
  preTranslations.set(translations);
  const preRotations = ensureFloat32ArrayLength(scratch.preRotations, rotations.length);
  scratch.preRotations = preRotations;
  preRotations.set(rotations);
  for (const bone of skeleton.bones) {
    if (bone.transformAfterPhysics !== true) {
      continue;
    }
    const restTranslation = bone.restTranslation;
    if (restTranslation) {
      const parentRestTranslation =
        bone.parentIndex === undefined || bone.parentIndex < 0
          ? undefined
          : skeleton.bones[bone.parentIndex]?.restTranslation;
      const offset = bone.index * 3;
      preTranslations[offset] = restTranslation[0] - (parentRestTranslation?.[0] ?? 0);
      preTranslations[offset + 1] = restTranslation[1] - (parentRestTranslation?.[1] ?? 0);
      preTranslations[offset + 2] = restTranslation[2] - (parentRestTranslation?.[2] ?? 0);
    }
    writeQuaternionToBuffer(preRotations, bone.index, identityRotation);
  }
  const preWorldMatricesColumnMajor = ensureFloat32ArrayLength(
    scratch.preWorldMatricesColumnMajor,
    fallbackWorldMatricesColumnMajor.length
  );
  scratch.preWorldMatricesColumnMajor = preWorldMatricesColumnMajor;
  if (!composeMmdWorldMatricesFromLocalBuffers(
    skeleton, preTranslations, preRotations, preWorldMatricesColumnMajor, scratch
  )) {
    preWorldMatricesColumnMajor.set(fallbackWorldMatricesColumnMajor);
  }
  return scratch;
}

function composeMmdWorldMatricesFromLocalBuffers(
  skeleton: NonNullable<MmdPhysicsStepContext["skeleton"]>,
  translations: Float32Array,
  rotations: Float32Array,
  matrices: Float32Array,
  scratch: PrePhysicsScratch
): Float32Array | undefined {
  const boneCount = skeleton.bones.length;
  prepareVector3ScratchArray(scratch.composeWorldPositions, boneCount);
  prepareQuaternionScratchArray(scratch.composeWorldRotations, boneCount);
  const worldPositions = scratch.composeWorldPositions;
  const worldRotations = scratch.composeWorldRotations;
  const matrix = scratch.composeMatrix;
  const unitScale = scratch.composeUnitScale;
  for (const bone of skeleton.bones) {
    const index = bone.index;
    if (index < 0 || index >= boneCount) {
      return undefined;
    }
    const localPosition = readVector3FromBuffer(translations, index, scratch.localPosition);
    const localRotation = readQuaternionFromBuffer(rotations, index, scratch.localRotation);
    const parentIndex = bone.parentIndex ?? -1;
    if (parentIndex >= 0 && parentIndex < boneCount) {
      worldPositions[index].copy(localPosition).applyQuaternion(worldRotations[parentIndex]);
      worldPositions[index].add(worldPositions[parentIndex]);
      worldRotations[index].copy(worldRotations[parentIndex]).multiply(localRotation);
    } else {
      worldPositions[index].copy(localPosition);
      worldRotations[index].copy(localRotation);
    }
    matrix.compose(worldPositions[index], worldRotations[index], unitScale);
    matrices.set(matrix.elements, index * 16);
  }
  return matrices;
}

function mergePhysicsOutputDeltas(
  context: MmdPhysicsStepContext,
  targetTranslations: Float32Array,
  targetRotations: Float32Array,
  scratch: PrePhysicsScratch
): void {
  const outputTranslations = context.output?.translations;
  const outputRotations = context.output?.rotations;
  const boneCount = context.skeleton?.bones.length ?? 0;
  if (outputTranslations) {
    for (let index = 0; index < boneCount; index += 1) {
      const base = index * 3;
      outputTranslations[base] =
        targetTranslations[base] + outputTranslations[base] - scratch.preTranslations[base];
      outputTranslations[base + 1] =
        targetTranslations[base + 1] +
        outputTranslations[base + 1] -
        scratch.preTranslations[base + 1];
      outputTranslations[base + 2] =
        targetTranslations[base + 2] +
        outputTranslations[base + 2] -
        scratch.preTranslations[base + 2];
    }
  }
  if (outputRotations) {
    for (let index = 0; index < boneCount; index += 1) {
      const target = readQuaternionFromBuffer(targetRotations, index, scratch.mergeTargetRotation);
      const pre = readQuaternionFromBuffer(scratch.preRotations, index, scratch.mergePreRotation).invert();
      const physics = readQuaternionFromBuffer(outputRotations, index, scratch.mergePhysicsRotation);
      physics.multiply(pre).multiply(target).normalize();
      const base = index * 4;
      outputRotations[base] = physics.x;
      outputRotations[base + 1] = physics.y;
      outputRotations[base + 2] = physics.z;
      outputRotations[base + 3] = physics.w;
    }
  }
}

function readVector3FromBuffer(
  buffer: ArrayLike<number>,
  index: number,
  target: THREE.Vector3
): THREE.Vector3 {
  const offset = index * 3;
  return target.set(buffer[offset], buffer[offset + 1], buffer[offset + 2]);
}

function readQuaternionFromBuffer(
  buffer: ArrayLike<number>,
  index: number,
  target: THREE.Quaternion
): THREE.Quaternion {
  const offset = index * 4;
  return target.set(
    buffer[offset],
    buffer[offset + 1],
    buffer[offset + 2],
    buffer[offset + 3]
  ).normalize();
}

function applyPhysicsOutputToSkeleton(
  mesh: THREE.SkinnedMesh,
  context: MmdPhysicsStepContext,
  applied: Uint8Array,
  updatedBoneCount?: number
): void {
  const translations = context.output?.translations;
  const rotations = context.output?.rotations;
  if (!translations && !rotations) {
    return;
  }
  const updatedIndices = context.output?.updatedBoneIndices;
  const indexCount = updatedBoneCount ?? updatedIndices?.length ?? 0;
  if (!updatedIndices || indexCount === 0) {
    for (let index = 0; index < mesh.skeleton.bones.length; index += 1) {
      applyPhysicsOutputToBone(mesh.skeleton.bones[index], index, translations, rotations);
    }
    return;
  }
  applied.fill(0);
  for (let offset = 0; offset < indexCount; offset += 1) {
    const index = updatedIndices[offset];
    if (applied[index]) {
      continue;
    }
    applied[index] = 1;
    applyPhysicsOutputToBone(mesh.skeleton.bones[index], index, translations, rotations);
  }
}

function applyPhysicsOutputToBone(
  bone: THREE.Bone | undefined,
  index: number,
  translations: ArrayLike<number> | undefined,
  rotations: ArrayLike<number> | undefined
): void {
  if (!bone) {
    return;
  }
  if (translations && index * 3 + 2 < translations.length) {
    bone.position.set(
      translations[index * 3],
      translations[index * 3 + 1],
      -translations[index * 3 + 2]
    );
  }
  if (rotations && index * 4 + 3 < rotations.length) {
    bone.quaternion.set(
      -rotations[index * 4],
      -rotations[index * 4 + 1],
      rotations[index * 4 + 2],
      rotations[index * 4 + 3]
    );
  }
}

export { applyPhysicsOutputToSkeleton, createPhysicsResetContext, createPrePhysicsInputBuffersIfNeeded, mergePhysicsOutputDeltas };
export type { PrePhysicsScratch };
