import * as THREE from "three";
import { syncMorphSplitTargetInfluences } from "../runtime/morphSplitSync.js";
import type { MmdRuntimePoseBuffer } from "./protocol.js";

const mmdAxisSigns = [1, 1, -1, 1] as const;

export interface MmdRuntimePoseApplyScratch {
  readonly worldMatrices: readonly THREE.Matrix4[];
  readonly parentIndices: Int32Array;
  readonly parentInverse: THREE.Matrix4;
  readonly localMatrix: THREE.Matrix4;
}

export function createMmdRuntimePoseApplyScratch(
  mesh: THREE.SkinnedMesh
): MmdRuntimePoseApplyScratch {
  const bones = mesh.skeleton.bones;
  const worldMatrices = new Array<THREE.Matrix4>(bones.length);
  const parentIndices = new Int32Array(bones.length);
  for (let index = 0; index < bones.length; index += 1) {
    worldMatrices[index] = new THREE.Matrix4();
    parentIndices[index] = bones[index]?.parent
      ? bones.indexOf(bones[index]?.parent as THREE.Bone)
      : -1;
  }
  return {
    worldMatrices,
    parentIndices,
    parentInverse: new THREE.Matrix4(),
    localMatrix: new THREE.Matrix4()
  };
}

/** Applies one current pose to a render skeleton using caller-owned matrix scratch. */
export function applyMmdRuntimePoseToMesh(
  pose: MmdRuntimePoseBuffer,
  mesh: THREE.SkinnedMesh,
  scratch: MmdRuntimePoseApplyScratch
): void {
  const bones = mesh.skeleton.bones;
  if (
    pose.worldMatricesColumnMajor.length !== bones.length * 16 ||
    scratch.worldMatrices.length !== bones.length ||
    scratch.parentIndices.length !== bones.length
  ) {
    throw new RangeError("MMD runtime pose apply bone count mismatch");
  }
  const influences = mesh.morphTargetInfluences;
  if (pose.morphWeights.length !== (influences?.length ?? 0)) {
    throw new RangeError("MMD runtime pose apply morph count mismatch");
  }

  for (let boneIndex = 0; boneIndex < bones.length; boneIndex += 1) {
    const matrix = scratch.worldMatrices[boneIndex];
    const elements = matrix.elements;
    const offset = boneIndex * 16;
    for (let column = 0; column < 4; column += 1) {
      const columnSign = mmdAxisSigns[column];
      for (let row = 0; row < 4; row += 1) {
        elements[column * 4 + row] =
          mmdAxisSigns[row] * pose.worldMatricesColumnMajor[offset + column * 4 + row] * columnSign;
      }
    }
  }
  for (let boneIndex = 0; boneIndex < bones.length; boneIndex += 1) {
    const bone = bones[boneIndex];
    const worldMatrix = scratch.worldMatrices[boneIndex];
    if (!bone || !worldMatrix) {
      continue;
    }
    const parentIndex = scratch.parentIndices[boneIndex] ?? -1;
    if (parentIndex >= 0) {
      const parentWorldMatrix = scratch.worldMatrices[parentIndex];
      if (!parentWorldMatrix) {
        throw new RangeError(`MMD runtime pose apply parent index out of range: ${parentIndex}`);
      }
      scratch.parentInverse.copy(parentWorldMatrix).invert();
      scratch.localMatrix.multiplyMatrices(scratch.parentInverse, worldMatrix);
    } else {
      scratch.localMatrix.copy(worldMatrix);
    }
    scratch.localMatrix.decompose(bone.position, bone.quaternion, bone.scale);
  }
  if (influences) {
    for (let index = 0; index < influences.length; index += 1) {
      influences[index] = pose.morphWeights[index] ?? 0;
    }
    syncMorphSplitTargetInfluences(mesh);
  }
  mesh.updateWorldMatrix(false, true);
  mesh.skeleton.update();
}
