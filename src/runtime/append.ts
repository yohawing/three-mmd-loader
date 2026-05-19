import type * as THREE from "three";
import { prepareQuaternionScratchArray, prepareVector3ScratchArray, weightedThreeQuaternion, zeroVector3 } from "./math.js";
import type { RuntimeRestTransform } from "./types.js";
export function appendTransformOrder(bones: readonly THREE.Bone[]): number[] {
  return bones
    .map((bone, index) => ({
      index,
      layer: readBoneLayer(bone)
    }))
    .sort((left, right) => left.layer - right.layer || left.index - right.index)
    .map((entry) => entry.index);
}

function readBoneLayer(bone: THREE.Bone): number {
  const layer = bone.userData.mmdLayer;
  return Number.isFinite(layer) ? Number(layer) : 0;
}

export function applyAppendTransforms(mesh: THREE.SkinnedMesh | undefined, scratchAppendTranslations: THREE.Vector3[], scratchAppendRotations: THREE.Quaternion[], scratchVector3A: THREE.Vector3, scratchQuaternionA: THREE.Quaternion): void {
    if (!mesh) {
      return;
    }

    const bones = mesh.skeleton.bones;
    const appendTranslations = prepareVector3ScratchArray(scratchAppendTranslations, bones.length);
    const appendRotations = prepareQuaternionScratchArray(scratchAppendRotations, bones.length);
    for (const index of appendTransformOrder(bones)) {
      const bone = bones[index];
      if (!bone) {
        continue;
      }
      const appendTransform = bone.userData.mmdAppendTransform as
        | { readonly parentIndex: number; readonly weight: number }
        | undefined;
      const flags = bone.userData.mmdFlags as
        | {
            readonly appendRotate?: boolean;
            readonly appendTranslate?: boolean;
            readonly appendLocal?: boolean;
          }
        | undefined;
      if (!appendTransform || (!flags?.appendRotate && !flags?.appendTranslate)) {
        continue;
      }

      const sourceBone = bones[appendTransform.parentIndex];
      if (!sourceBone) {
        continue;
      }
      const weight = appendTransform.weight;
      const parentHasAppend = sourceBone.userData.mmdAppendTransform !== undefined;

      if (flags.appendRotate) {
        const sourceRotation = sourceBone.quaternion;
        const slerpQ = weightedThreeQuaternion(sourceRotation, weight, scratchQuaternionA);
        appendRotations[index].copy(slerpQ);
        bone.quaternion.multiply(slerpQ);
      }
      if (flags.appendTranslate) {
        const weightedTranslation = scratchVector3A.copy(
          !flags.appendLocal && parentHasAppend
            ? appendTranslations[appendTransform.parentIndex]
            : sourceBone.position
        );
        weightedTranslation.multiplyScalar(weight);
        appendTranslations[index].copy(weightedTranslation);
        bone.position.add(weightedTranslation);
      }
    }
  }

export function reapplyAppendTransformsForSources(mesh: THREE.SkinnedMesh | undefined, sourceBoneIndices: ReadonlySet<number>, preAppendTransforms: readonly RuntimeRestTransform[], scratchReapplyAppendTranslations: THREE.Vector3[], scratchReapplyAppendRotations: THREE.Quaternion[], scratchVector3A: THREE.Vector3, scratchQuaternionA: THREE.Quaternion): void {
    if (!mesh || sourceBoneIndices.size === 0 || preAppendTransforms.length === 0) {
      return;
    }
    const bones = mesh.skeleton.bones;
    const appendTranslations = prepareVector3ScratchArray(
      scratchReapplyAppendTranslations,
      bones.length
    );
    const appendRotations = prepareQuaternionScratchArray(
      scratchReapplyAppendRotations,
      bones.length
    );
    const changedBoneIndices = new Set(sourceBoneIndices);
    const reappliedBoneIndices = new Set<number>();
    const order = appendTransformOrder(bones);
    let changed = true;
    while (changed) {
      changed = false;
      for (const index of order) {
        if (reappliedBoneIndices.has(index)) {
          continue;
        }
        const bone = bones[index];
        const appendTransform = bone?.userData.mmdAppendTransform as
          | { readonly parentIndex: number; readonly weight: number }
          | undefined;
        const flags = bone?.userData.mmdFlags as
          | {
              readonly appendRotate?: boolean;
              readonly appendTranslate?: boolean;
              readonly appendLocal?: boolean;
            }
          | undefined;
        if (
          !bone ||
          !appendTransform ||
          !changedBoneIndices.has(appendTransform.parentIndex) ||
          (!flags?.appendRotate && !flags?.appendTranslate)
        ) {
          continue;
        }
        const base = preAppendTransforms[index];
        const sourceBone = bones[appendTransform.parentIndex];
        if (!base || !sourceBone) {
          continue;
        }
        bone.position.copy(base.position);
        bone.quaternion.copy(base.quaternion);

        const parentHasAppend = sourceBone.userData.mmdAppendTransform !== undefined;
        if (flags.appendRotate) {
          const sourceRotation =
            !flags.appendLocal && parentHasAppend
              ? appendRotations[appendTransform.parentIndex]
              : sourceBone.quaternion;
          const weightedRotation = weightedThreeQuaternion(
            sourceRotation,
            appendTransform.weight,
            scratchQuaternionA
          );
          appendRotations[index].copy(weightedRotation);
          bone.quaternion.multiply(weightedRotation);
        }
        if (flags.appendTranslate) {
          const sourceTranslation = scratchVector3A.copy(
            !flags.appendLocal && parentHasAppend
              ? appendTranslations[appendTransform.parentIndex]
              : sourceBone.position
          );
          if (flags.appendLocal || !parentHasAppend) {
            sourceTranslation.sub(
              preAppendTransforms[appendTransform.parentIndex]?.position ?? zeroVector3
            );
          }
          const weightedTranslation = sourceTranslation.multiplyScalar(appendTransform.weight);
          appendTranslations[index].copy(weightedTranslation);
          bone.position.add(weightedTranslation);
        }
        reappliedBoneIndices.add(index);
        changedBoneIndices.add(index);
        changed = true;
      }
    }
  }
