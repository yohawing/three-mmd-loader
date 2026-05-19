import * as THREE from "three";
import type { CameraState, LightState, MmdAnimation, VmdBoneFrame, VmdCameraFrame, VmdLightFrame, VmdMorphFrame } from "../parser/model/modelTypes.js";
import { interpolateBezier, lerp, mmdQuaternionToThree, slerp, weightedThreeQuaternion } from "./math.js";
import type { RuntimeMorph, RuntimeRestTransform } from "./types.js";
export function applyMmdAnimation(mesh: THREE.SkinnedMesh | undefined, animation: MmdAnimation | undefined, restTransforms: readonly RuntimeRestTransform[], frame: number): { readonly bonePhysicsToggles: Record<string, number>; readonly preAppendTransforms: RuntimeRestTransform[]; } | undefined {
    if (!mesh || !animation) {
      return;
    }

    const bonePhysicsToggles: Record<string, number> = {};
    mesh.skeleton.bones.forEach((bone, index) => {
      const rest = restTransforms[index];
      if (rest) {
        bone.position.copy(rest.position);
        bone.quaternion.copy(rest.quaternion);
      }
      const track = findBoneTrack(animation, bone);
      const sampled = sampleBoneTrack(track, frame);
      if (!sampled) {
        return;
      }
      if (sampled.physicsToggle !== undefined) {
        bonePhysicsToggles[bone.userData.mmdBoneName ?? bone.name] = sampled.physicsToggle;
        if (typeof bone.userData.mmdEnglishBoneName === "string") {
          bonePhysicsToggles[bone.userData.mmdEnglishBoneName] = sampled.physicsToggle;
        }
      }
      const restPosition = rest?.position ?? bone.position;
      bone.position.set(
        restPosition.x + sampled.translation[0],
        restPosition.y + sampled.translation[1],
        restPosition.z - sampled.translation[2]
      );
      bone.quaternion.fromArray(mmdQuaternionToThree(sampled.rotation));
    });

    const morphTargetInfluences = mesh.morphTargetInfluences;
    const morphTargetDictionary = mesh.morphTargetDictionary;
    if (morphTargetInfluences && morphTargetDictionary) {
      morphTargetInfluences.fill(0);
      for (const [morphName, morphIndex] of Object.entries(morphTargetDictionary)) {
        const track = animation.morphTracks[morphName];
        if (track) {
          morphTargetInfluences[morphIndex] = sampleMorphTrack(track, frame);
        }
      }
      const runtimeMorphs = readRuntimeMorphs(mesh);
      expandGroupMorphWeights(runtimeMorphs, morphTargetInfluences);
      applyBoneMorphs(mesh, runtimeMorphs, morphTargetInfluences);
    }
    const preAppendTransforms = mesh.skeleton.bones.map((bone) => ({
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone()
    }));
    return { bonePhysicsToggles, preAppendTransforms };
  }

function isMmdAnimation(value: unknown): value is MmdAnimation {
  return (
    typeof value === "object" && value !== null && "boneTracks" in value && "morphTracks" in value
  );
}

function findBoneTrack(animation: MmdAnimation, bone: THREE.Bone): VmdBoneFrame[] | undefined {
  const names = [bone.userData.mmdBoneName, bone.userData.mmdEnglishBoneName, bone.name].filter(
    (name): name is string => typeof name === "string" && name.length > 0
  );
  for (const name of names) {
    const track = animation.boneTracks[name];
    if (track) {
      return track;
    }
  }
  return undefined;
}

function sampleBoneTrack(
  frames: readonly VmdBoneFrame[] | undefined,
  frame: number
): VmdBoneFrame | undefined {
  if (!frames || frames.length === 0) {
    return undefined;
  }
  if (frame < frames[0].frame) {
    return frames[0];
  }
  let previous = frames[0];
  for (let i = 1; i < frames.length; i += 1) {
    const next = frames[i];
    if (frame === next.frame) {
      previous = next;
      continue;
    }
    if (frame < next.frame) {
      const t = (frame - previous.frame) / Math.max(next.frame - previous.frame, 1);
      return {
        frame,
        translation: [
          lerp(
            previous.translation[0],
            next.translation[0],
            interpolateBezier(next.interpolation?.translationX, t)
          ),
          lerp(
            previous.translation[1],
            next.translation[1],
            interpolateBezier(next.interpolation?.translationY, t)
          ),
          lerp(
            previous.translation[2],
            next.translation[2],
            interpolateBezier(next.interpolation?.translationZ, t)
          )
        ],
        rotation: slerp(
          previous.rotation,
          next.rotation,
          interpolateBezier(next.interpolation?.rotation, t)
        ),
        physicsToggle: previous.physicsToggle
      };
    }
    previous = next;
  }
  return previous;
}

function sampleMorphTrack(frames: readonly VmdMorphFrame[], frame: number): number {
  if (frames.length === 0) {
    return 0;
  }
  if (frame < frames[0].frame) {
    return frames[0].weight;
  }
  let previous = frames[0];
  for (let i = 1; i < frames.length; i += 1) {
    const next = frames[i];
    if (frame === next.frame) {
      return next.weight;
    }
    if (frame < next.frame) {
      const t = (frame - previous.frame) / Math.max(next.frame - previous.frame, 1);
      return lerp(previous.weight, next.weight, t);
    }
    previous = next;
  }
  return previous.weight;
}

export function sampleMmdCameraTrack(
  frames: readonly VmdCameraFrame[],
  frame: number
): CameraState | undefined {
  const pair = sampleFramePair(frames, frame);
  if (!pair) {
    return undefined;
  }
  const { previous, next, t } = pair;
  const interpolation = next.interpolation;
  return {
    distance: lerp(previous.distance, next.distance, interpolateBezier(interpolation?.distance, t)),
    position: [
      lerp(previous.position[0], next.position[0], interpolateBezier(interpolation?.positionX, t)),
      lerp(previous.position[1], next.position[1], interpolateBezier(interpolation?.positionY, t)),
      lerp(previous.position[2], next.position[2], interpolateBezier(interpolation?.positionZ, t))
    ],
    rotation: [
      lerp(previous.rotation[0], next.rotation[0], interpolateBezier(interpolation?.rotation, t)),
      lerp(previous.rotation[1], next.rotation[1], interpolateBezier(interpolation?.rotation, t)),
      lerp(previous.rotation[2], next.rotation[2], interpolateBezier(interpolation?.rotation, t))
    ],
    fov: lerp(previous.fov, next.fov, interpolateBezier(interpolation?.fov, t)),
    perspective: t < 1 ? previous.perspective : next.perspective
  };
}

export function sampleMmdLightTrack(
  frames: readonly VmdLightFrame[],
  frame: number
): LightState | undefined {
  const pair = sampleFramePair(frames, frame);
  if (!pair) {
    return undefined;
  }
  const { previous, next, t } = pair;
  return {
    color: [
      lerp(previous.color[0], next.color[0], t),
      lerp(previous.color[1], next.color[1], t),
      lerp(previous.color[2], next.color[2], t)
    ],
    direction: [
      lerp(previous.direction[0], next.direction[0], t),
      lerp(previous.direction[1], next.direction[1], t),
      lerp(previous.direction[2], next.direction[2], t)
    ]
  };
}

function sampleFramePair<T extends { readonly frame: number }>(
  frames: readonly T[],
  frame: number
): { readonly previous: T; readonly next: T; readonly t: number } | undefined {
  if (frames.length === 0) {
    return undefined;
  }
  if (frame < frames[0].frame) {
    return { previous: frames[0], next: frames[0], t: 0 };
  }
  let previous = frames[0];
  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index];
    if (frame === next.frame) {
      previous = next;
      continue;
    }
    if (frame < next.frame) {
      return {
        previous,
        next,
        t: (frame - previous.frame) / Math.max(next.frame - previous.frame, 1)
      };
    }
    previous = next;
  }
  return { previous, next: previous, t: 0 };
}

function readRuntimeMorphs(mesh: THREE.SkinnedMesh): RuntimeMorph[] {
  const morphs = mesh.userData.mmdMorphs;
  return Array.isArray(morphs) ? morphs.filter(isRuntimeMorph) : [];
}

function isRuntimeMorph(value: unknown): value is RuntimeMorph {
  return typeof value === "object" && value !== null && "type" in value && "groupOffsets" in value;
}

function expandGroupMorphWeights(morphs: readonly RuntimeMorph[], weights: number[]): void {
  if (morphs.length === 0) {
    return;
  }
  const directWeights = weights.slice();
  for (let index = 0; index < morphs.length; index += 1) {
    const weight = directWeights[index] ?? 0;
    if (weight === 0) {
      continue;
    }
    expandMorphWeight(morphs, weights, index, weight, new Set([index]));
  }
}

function expandMorphWeight(
  morphs: readonly RuntimeMorph[],
  weights: number[],
  morphIndex: number,
  weight: number,
  path: Set<number>
): void {
  const morph = morphs[morphIndex];
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
    if (contribution === 0 || path.has(targetIndex)) {
      continue;
    }
    path.add(targetIndex);
    expandMorphWeight(morphs, weights, targetIndex, contribution, path);
    path.delete(targetIndex);
  }
}

function applyBoneMorphs(
  mesh: THREE.SkinnedMesh,
  morphs: readonly RuntimeMorph[],
  weights: readonly number[]
): void {
  if (morphs.length === 0) {
    return;
  }
  for (let morphIndex = 0; morphIndex < morphs.length; morphIndex += 1) {
    const morph = morphs[morphIndex];
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
      bone.quaternion.premultiply(
        weightedThreeQuaternion(
          new THREE.Quaternion().fromArray(mmdQuaternionToThree(offset.rotation)),
          weight
        )
      );
    }
  }
}

export { findBoneTrack, isMmdAnimation, sampleBoneTrack, sampleFramePair, sampleMorphTrack };
