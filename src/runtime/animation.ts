import * as THREE from "three";
import type { MmdAnimation, VmdBoneTrack } from "../parser/model/modelTypes.js";
import { type BoneSampleScratch, sampleBoneTrackInto, sampleMorphTrack } from "./boneTrackSampling.js";
import { weightedThreeQuaternion } from "./math.js";
import type { MmdMorphOverrides, RuntimeMorph, RuntimeRestTransform } from "./types.js";
import { applyMorphOverrides } from "./morphOverrides.js";
import { readMmdBoneUserData, readMmdMeshRuntimeData } from "./userData.js";

export interface ApplyMmdAnimationScratch {
  readonly boneMorphQuaternion: THREE.Quaternion;
  readonly boneSample: BoneSampleScratch;
  readonly bonePhysicsToggles: Record<string, number>;
  readonly groupMorphDirectWeights: number[];
  groupMorphVisited: Uint8Array;
}

export function applyMmdAnimation(
  mesh: THREE.SkinnedMesh | undefined,
  animation: MmdAnimation | undefined,
  restTransforms: readonly RuntimeRestTransform[],
  preAppendTransforms: RuntimeRestTransform[],
  scratch: ApplyMmdAnimationScratch,
  frame: number,
  morphOverrides?: MmdMorphOverrides
): Record<string, number> | undefined {
    if (!mesh) {
      return;
    }

    const bonePhysicsToggles = scratch.bonePhysicsToggles;
    clearNumberRecord(bonePhysicsToggles);
    const bones = mesh.skeleton.bones;
    for (let index = 0; index < bones.length; index += 1) {
      const bone = bones[index];
      const rest = restTransforms[index];
      if (rest) {
        bone.position.copy(rest.position);
        bone.quaternion.copy(rest.quaternion);
      }
      const track = animation ? findBoneTrack(animation, bone) : undefined;
      const sampled = sampleBoneTrackInto(track, frame, scratch.boneSample);
      if (!sampled) {
        continue;
      }
      if (sampled.hasPhysicsToggle) {
        const userData = readMmdBoneUserData(bone);
        bonePhysicsToggles[
          typeof userData.mmdBoneName === "string" ? userData.mmdBoneName : bone.name
        ] = sampled.physicsToggle;
        if (typeof userData.mmdEnglishBoneName === "string") {
          bonePhysicsToggles[userData.mmdEnglishBoneName] = sampled.physicsToggle;
        }
      }
      const restPosition = rest?.position ?? bone.position;
      bone.position.set(
        restPosition.x + sampled.translationX,
        restPosition.y + sampled.translationY,
        restPosition.z - sampled.translationZ
      );
      bone.quaternion.set(
        -sampled.rotationX,
        -sampled.rotationY,
        sampled.rotationZ,
        sampled.rotationW
      );
    }

    const morphTargetInfluences = mesh.morphTargetInfluences;
    const morphTargetDictionary = mesh.morphTargetDictionary;
    if (morphTargetInfluences && morphTargetDictionary) {
      morphTargetInfluences.fill(0);
      for (const morphName in morphTargetDictionary) {
        const morphIndex = morphTargetDictionary[morphName];
        const track = animation?.morphTracks[morphName];
        if (track) {
          morphTargetInfluences[morphIndex] = sampleMorphTrack(track, frame);
        }
      }
      applyMorphOverrides(morphTargetInfluences, morphOverrides);
      const runtimeMorphs = readRuntimeMorphs(mesh);
      expandGroupMorphWeights(runtimeMorphs, morphTargetInfluences, scratch);
      applyBoneMorphs(mesh, runtimeMorphs, morphTargetInfluences, scratch.boneMorphQuaternion);
    }
    copyPreAppendTransforms(mesh.skeleton.bones, preAppendTransforms);
    return bonePhysicsToggles;
  }

function isMmdAnimation(value: unknown): value is MmdAnimation {
  return (
    typeof value === "object" && value !== null && "boneTracks" in value && "morphTracks" in value
  );
}

function findBoneTrack(
  animation: MmdAnimation,
  bone: THREE.Bone
): VmdBoneTrack | undefined {
  const userData = readMmdBoneUserData(bone);
  const mmdName = userData.mmdBoneName;
  if (typeof mmdName === "string" && mmdName.length > 0) {
    const track = animation.boneTracks[mmdName];
    if (track) return track;
  }
  const englishName = userData.mmdEnglishBoneName;
  if (typeof englishName === "string" && englishName.length > 0) {
    const track = animation.boneTracks[englishName];
    if (track) return track;
  }
  if (bone.name.length > 0) {
    return animation.boneTracks[bone.name];
  }
  return undefined;
}

function readRuntimeMorphs(mesh: THREE.SkinnedMesh): readonly unknown[] {
  const morphs = readMmdMeshRuntimeData(mesh).mmdMorphs;
  return Array.isArray(morphs) ? morphs : [];
}

function isRuntimeMorph(value: unknown): value is RuntimeMorph {
  return typeof value === "object" && value !== null && "type" in value && "groupOffsets" in value;
}

function expandGroupMorphWeights(
  morphs: readonly unknown[],
  weights: number[],
  scratch: ApplyMmdAnimationScratch
): void {
  if (morphs.length === 0) {
    return;
  }
  const directWeights = scratch.groupMorphDirectWeights;
  directWeights.length = weights.length;
  for (let index = 0; index < weights.length; index += 1) {
    directWeights[index] = weights[index] ?? 0;
  }
  if (scratch.groupMorphVisited.length < weights.length) {
    scratch.groupMorphVisited = new Uint8Array(weights.length);
  }
  const visited = scratch.groupMorphVisited;
  visited.fill(0, 0, weights.length);
  for (let index = 0; index < morphs.length; index += 1) {
    const weight = directWeights[index] ?? 0;
    if (weight === 0) {
      continue;
    }
    visited[index] = 1;
    expandMorphWeight(morphs, weights, index, weight, visited);
    visited[index] = 0;
  }
}

function expandMorphWeight(
  morphs: readonly unknown[],
  weights: number[],
  morphIndex: number,
  weight: number,
  visited: Uint8Array
): void {
  const morph = morphs[morphIndex];
  if (!isRuntimeMorph(morph)) {
    return;
  }
  if ((morph?.type !== "group" && morph?.type !== "flip") || weight === 0) {
    return;
  }
  const offsets = morph.type === "flip" ? (morph.flipOffsets ?? []) : morph.groupOffsets;
  for (const offset of offsets) {
    const targetIndex = offset.morphIndex;
    if (targetIndex < 0 || targetIndex >= weights.length) {
      continue;
    }
    const contribution = weight * offset.weight;
    weights[targetIndex] += contribution;
    if (contribution === 0 || visited[targetIndex] === 1) {
      continue;
    }
    visited[targetIndex] = 1;
    expandMorphWeight(morphs, weights, targetIndex, contribution, visited);
    visited[targetIndex] = 0;
  }
}

function applyBoneMorphs(
  mesh: THREE.SkinnedMesh,
  morphs: readonly unknown[],
  weights: readonly number[],
  scratchQuaternion: THREE.Quaternion
): void {
  if (morphs.length === 0) {
    return;
  }
  for (let morphIndex = 0; morphIndex < morphs.length; morphIndex += 1) {
    const morph = morphs[morphIndex];
    if (!isRuntimeMorph(morph)) {
      continue;
    }
    const weight = weights[morphIndex] ?? 0;
    if (morph?.type !== "bone" || weight === 0) {
      continue;
    }
    for (const offset of morph.boneOffsets ?? []) {
      const bone = mesh.skeleton.bones[offset.boneIndex];
      if (!bone) {
        continue;
      }
      bone.position.x += offset.translation[0] * weight;
      bone.position.y += offset.translation[1] * weight;
      bone.position.z -= offset.translation[2] * weight;
      scratchQuaternion.set(
        -offset.rotation[0],
        -offset.rotation[1],
        offset.rotation[2],
        offset.rotation[3]
      );
      bone.quaternion.premultiply(weightedThreeQuaternion(scratchQuaternion, weight, scratchQuaternion));
    }
  }
}

export function preparePreAppendTransforms(
  bones: readonly THREE.Bone[],
  preAppendTransforms: RuntimeRestTransform[]
): void {
  preAppendTransforms.length = bones.length;
  for (let index = 0; index < bones.length; index += 1) {
    if (!preAppendTransforms[index]) {
      preAppendTransforms[index] = {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion()
      };
    }
  }
}

function copyPreAppendTransforms(
  bones: readonly THREE.Bone[],
  preAppendTransforms: RuntimeRestTransform[]
): void {
  preAppendTransforms.length = bones.length;
  for (let index = 0; index < bones.length; index += 1) {
    const bone = bones[index];
    const transform = preAppendTransforms[index];
    if (!transform) {
      throw new Error("MMD runtime pre-append transform scratch was not prepared");
    }
    transform.position.copy(bone.position);
    transform.quaternion.copy(bone.quaternion);
  }
}

function clearNumberRecord(record: Record<string, number>): void {
  for (const key in record) {
    delete record[key];
  }
}

export { findBoneTrack, isMmdAnimation };
