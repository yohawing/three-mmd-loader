import * as THREE from "three";
import type { CameraState, LightState, MmdAnimation, SelfShadowState, VmdBoneFrame, VmdBoneTrack, VmdCameraFrame, VmdLightFrame, VmdMorphTrack, VmdSelfShadowFrame } from "../parser/model/modelTypes.js";
import { interpolateBezier, lerp, slerp, weightedThreeQuaternion } from "./math.js";
import type { RuntimeMorph, RuntimeRestTransform } from "./types.js";
import { readMmdBoneUserData, readMmdMeshRuntimeData } from "./userData.js";
export interface ApplyMmdAnimationScratch {
  readonly boneMorphQuaternion: THREE.Quaternion;
  readonly boneSample: BoneSampleScratch;
  readonly bonePhysicsToggles: Record<string, number>;
  readonly groupMorphDirectWeights: number[];
  groupMorphVisited: Uint8Array;
}

interface BoneSampleScratch {
  frame: number;
  translationX: number;
  translationY: number;
  translationZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  rotationW: number;
  hasPhysicsToggle: boolean;
  physicsToggle: number;
}

export function applyMmdAnimation(
  mesh: THREE.SkinnedMesh | undefined,
  animation: MmdAnimation | undefined,
  restTransforms: readonly RuntimeRestTransform[],
  preAppendTransforms: RuntimeRestTransform[],
  scratch: ApplyMmdAnimationScratch,
  frame: number
): Record<string, number> | undefined {
    if (!mesh || !animation) {
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
      const track = findBoneTrack(animation, bone);
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
        const track = animation.morphTracks[morphName];
        if (track) {
          morphTargetInfluences[morphIndex] = sampleMorphTrack(track, frame);
        }
      }
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

function sampleBoneTrack(
  frames: VmdBoneTrack | undefined,
  frame: number
): VmdBoneFrame | undefined {
  if (!frames) {
    return undefined;
  }
  return samplePackedBoneTrack(frames, frame);
}

function sampleBoneTrackInto(
  track: VmdBoneTrack | undefined,
  frame: number,
  target: BoneSampleScratch
): BoneSampleScratch | undefined {
  if (!track || !samplePackedBoneTrackInto(track, frame, target)) {
    return undefined;
  }
  return target;
}

function sampleMorphTrack(frames: VmdMorphTrack, frame: number): number {
  return samplePackedMorphTrack(frames, frame);
}

export function sampleMmdCameraTrack(
  frames: readonly VmdCameraFrame[],
  frame: number
): CameraState | undefined {
  return sampleMmdCameraTrackInto(frames, frame, {
    distance: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    fov: 1,
    perspective: true
  });
}

export function sampleMmdCameraTrackInto(
  frames: readonly VmdCameraFrame[],
  frame: number,
  target: CameraState,
  hint?: { index: number }
): CameraState | undefined {
  if (frames.length === 0) {
    return undefined;
  }
  let index = hint?.index ?? 0;
  if (index >= frames.length || frames[index].frame > frame) {
    index = 0;
  }
  let previous = frames[index] ?? frames[0];
  let next = previous;
  let t = 0;
  if (frame < previous.frame) {
    previous = frames[0];
    next = previous;
    index = 0;
  } else {
    while (index + 1 < frames.length && frames[index + 1].frame <= frame) {
      index += 1;
    }
    previous = frames[index] ?? previous;
    next = frames[index + 1] ?? previous;
    t = interpolationRatio(previous.frame, next.frame, frame);
    if (hint) {
      hint.index = index;
    }
  }
  const interpolation = next.interpolation;
  target.distance = lerp(previous.distance, next.distance, interpolateBezier(interpolation?.distance, t));
  target.position[0] = lerp(previous.position[0], next.position[0], interpolateBezier(interpolation?.positionX, t));
  target.position[1] = lerp(previous.position[1], next.position[1], interpolateBezier(interpolation?.positionY, t));
  target.position[2] = lerp(previous.position[2], next.position[2], interpolateBezier(interpolation?.positionZ, t));
  const rotationT = interpolateBezier(interpolation?.rotation, t);
  target.rotation[0] = lerp(previous.rotation[0], next.rotation[0], rotationT);
  target.rotation[1] = lerp(previous.rotation[1], next.rotation[1], rotationT);
  target.rotation[2] = lerp(previous.rotation[2], next.rotation[2], rotationT);
  target.fov = lerp(previous.fov, next.fov, interpolateBezier(interpolation?.fov, t));
  target.perspective = t < 1 ? previous.perspective : next.perspective;
  return target;
}

export function sampleMmdLightTrack(
  frames: readonly VmdLightFrame[],
  frame: number
): LightState | undefined {
  return sampleMmdLightTrackInto(frames, frame, {
    color: [0, 0, 0],
    direction: [0, 0, 0]
  });
}

export function sampleMmdLightTrackInto(
  frames: readonly VmdLightFrame[],
  frame: number,
  target: LightState
): LightState | undefined {
  const pair = sampleFramePair(frames, frame);
  if (!pair) {
    return undefined;
  }
  const { previous, next, t } = pair;
  target.color[0] = lerp(previous.color[0], next.color[0], t);
  target.color[1] = lerp(previous.color[1], next.color[1], t);
  target.color[2] = lerp(previous.color[2], next.color[2], t);
  target.direction[0] = lerp(previous.direction[0], next.direction[0], t);
  target.direction[1] = lerp(previous.direction[1], next.direction[1], t);
  target.direction[2] = lerp(previous.direction[2], next.direction[2], t);
  return target;
}

export function sampleMmdSelfShadowTrack(
  frames: readonly VmdSelfShadowFrame[],
  frame: number
): SelfShadowState | undefined {
  if (frames.length === 0) {
    return undefined;
  }
  if (frame < frames[0].frame) {
    return frames[0];
  }
  let index = 0;
  while (index + 1 < frames.length && frames[index + 1].frame <= frame) {
    index += 1;
  }
  return frames[index] ?? frames[0];
}

export function sampleMmdSelfShadowTrackInto(
  frames: readonly VmdSelfShadowFrame[],
  frame: number,
  target: SelfShadowState,
  hint?: { index: number }
): SelfShadowState | undefined {
  if (frames.length === 0) {
    return undefined;
  }
  let index = hint?.index ?? 0;
  if (index >= frames.length || frames[index].frame > frame) {
    index = 0;
  }
  if (frame < frames[0].frame) {
    target.mode = frames[0].mode;
    target.distance = frames[0].distance;
    if (hint) {
      hint.index = 0;
    }
    return target;
  }
  while (index + 1 < frames.length && frames[index + 1].frame <= frame) {
    index += 1;
  }
  const current = frames[index] ?? frames[0];
  target.mode = current.mode;
  target.distance = current.distance;
  if (hint) {
    hint.index = index;
  }
  return target;
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
  let low = 1;
  let high = frames.length - 1;
  let nextIndex = frames.length;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const middleFrame = frames[middle]?.frame ?? Number.POSITIVE_INFINITY;
    if (frame < middleFrame) {
      nextIndex = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  if (nextIndex >= frames.length) {
    return { previous: frames[frames.length - 1], next: frames[frames.length - 1], t: 0 };
  }
  const previous = frames[nextIndex - 1];
  const next = frames[nextIndex];
  return {
    previous,
    next,
    t: interpolationRatio(previous.frame, next.frame, frame)
  };
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

function samplePackedBoneTrackInto(
  track: VmdBoneTrack,
  frame: number,
  target: BoneSampleScratch
): boolean {
  const frames = track.frames;
  if (frames.length === 0) {
    return false;
  }
  if (frame < (frames[0] ?? 0)) {
    readPackedBoneFrameInto(track, 0, frames[0] ?? 0, target);
    return true;
  }
  let previousIndex = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const nextFrame = frames[index] ?? 0;
    if (frame === nextFrame) {
      previousIndex = index;
      continue;
    }
    if (frame < nextFrame) {
      const previousFrame = frames[previousIndex] ?? 0;
      const t = interpolationRatio(previousFrame, nextFrame, frame);
      readInterpolatedPackedBoneFrameInto(track, previousIndex, index, frame, t, target);
      return true;
    }
    previousIndex = index;
  }
  readPackedBoneFrameInto(track, previousIndex, frames[previousIndex] ?? 0, target);
  return true;
}

function readPackedBoneFrameInto(
  track: VmdBoneTrack,
  index: number,
  frame: number,
  target: BoneSampleScratch
): void {
  const translationOffset = index * 3;
  const rotationOffset = index * 4;
  const physicsToggle = track.physicsToggles[index] ?? -1;
  target.frame = frame;
  target.translationX = track.translations[translationOffset] ?? 0;
  target.translationY = track.translations[translationOffset + 1] ?? 0;
  target.translationZ = track.translations[translationOffset + 2] ?? 0;
  target.rotationX = track.rotations[rotationOffset] ?? 0;
  target.rotationY = track.rotations[rotationOffset + 1] ?? 0;
  target.rotationZ = track.rotations[rotationOffset + 2] ?? 0;
  target.rotationW = track.rotations[rotationOffset + 3] ?? 1;
  target.hasPhysicsToggle = physicsToggle >= 0;
  target.physicsToggle = physicsToggle;
}

function readInterpolatedPackedBoneFrameInto(
  track: VmdBoneTrack,
  previousIndex: number,
  nextIndex: number,
  frame: number,
  t: number,
  target: BoneSampleScratch
): void {
  const previousTranslationOffset = previousIndex * 3;
  const nextTranslationOffset = nextIndex * 3;
  const interpolationOffset = nextIndex * 16;
  target.frame = frame;
  target.translationX = lerp(
    track.translations[previousTranslationOffset] ?? 0,
    track.translations[nextTranslationOffset] ?? 0,
    interpolatePackedCurve(track.interpolations, interpolationOffset, t)
  );
  target.translationY = lerp(
    track.translations[previousTranslationOffset + 1] ?? 0,
    track.translations[nextTranslationOffset + 1] ?? 0,
    interpolatePackedCurve(track.interpolations, interpolationOffset + 4, t)
  );
  target.translationZ = lerp(
    track.translations[previousTranslationOffset + 2] ?? 0,
    track.translations[nextTranslationOffset + 2] ?? 0,
    interpolatePackedCurve(track.interpolations, interpolationOffset + 8, t)
  );
  slerpPackedRotationInto(
    track,
    previousIndex,
    nextIndex,
    interpolatePackedCurve(track.interpolations, interpolationOffset + 12, t),
    target
  );
  const physicsToggle = track.physicsToggles[previousIndex] ?? -1;
  target.hasPhysicsToggle = physicsToggle >= 0;
  target.physicsToggle = physicsToggle;
}

function interpolatePackedCurve(values: Float32Array, offset: number, x: number): number {
  const x1 = values[offset] ?? 0;
  const y1 = values[offset + 1] ?? 0;
  const x2 = values[offset + 2] ?? 0;
  const y2 = values[offset + 3] ?? 0;
  if (Math.abs(x1 - y1) < 1e-6 && Math.abs(x2 - y2) < 1e-6) {
    return x;
  }
  let lower = 0;
  let upper = 1;
  let t = x;
  for (let i = 0; i < 16; i += 1) {
    const sampledX = cubicBezier(t, x1, x2);
    if (Math.abs(sampledX - x) < 1e-5) {
      break;
    }
    if (sampledX < x) {
      lower = t;
    } else {
      upper = t;
    }
    t = (lower + upper) / 2;
  }
  return cubicBezier(t, y1, y2);
}

function cubicBezier(t: number, p1: number, p2: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t;
}

function slerpPackedRotationInto(
  track: VmdBoneTrack,
  previousIndex: number,
  nextIndex: number,
  t: number,
  target: BoneSampleScratch
): void {
  const previousOffset = previousIndex * 4;
  const nextOffset = nextIndex * 4;
  const ax = track.rotations[previousOffset] ?? 0;
  const ay = track.rotations[previousOffset + 1] ?? 0;
  const az = track.rotations[previousOffset + 2] ?? 0;
  const aw = track.rotations[previousOffset + 3] ?? 1;
  let bx = track.rotations[nextOffset] ?? 0;
  let by = track.rotations[nextOffset + 1] ?? 0;
  let bz = track.rotations[nextOffset + 2] ?? 0;
  let bw = track.rotations[nextOffset + 3] ?? 1;
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    normalizeSampleRotationInto(
      lerp(ax, bx, t),
      lerp(ay, by, t),
      lerp(az, bz, t),
      lerp(aw, bw, t),
      target
    );
    return;
  }
  const theta0 = Math.acos(cos);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (cos * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  target.rotationX = ax * s0 + bx * s1;
  target.rotationY = ay * s0 + by * s1;
  target.rotationZ = az * s0 + bz * s1;
  target.rotationW = aw * s0 + bw * s1;
}

function normalizeSampleRotationInto(
  x: number,
  y: number,
  z: number,
  w: number,
  target: BoneSampleScratch
): void {
  const length = Math.hypot(x, y, z, w);
  if (length < 1e-8) {
    target.rotationX = 0;
    target.rotationY = 0;
    target.rotationZ = 0;
    target.rotationW = 1;
    return;
  }
  target.rotationX = x / length;
  target.rotationY = y / length;
  target.rotationZ = z / length;
  target.rotationW = w / length;
}

function samplePackedBoneTrack(track: VmdBoneTrack, frame: number): VmdBoneFrame | undefined {
  const frames = track.frames;
  if (frames.length === 0) {
    return undefined;
  }
  if (frame < (frames[0] ?? 0)) {
    return readPackedBoneFrame(track, 0, frames[0] ?? 0);
  }
  let previousIndex = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const nextFrame = frames[index] ?? 0;
    if (frame === nextFrame) {
      previousIndex = index;
      continue;
    }
    if (frame < nextFrame) {
      const previousFrame = frames[previousIndex] ?? 0;
      const t = interpolationRatio(previousFrame, nextFrame, frame);
      const interpolation = readPackedBoneInterpolation(track, index);
      const previous = readPackedBoneFrame(track, previousIndex, previousFrame);
      const next = readPackedBoneFrame(track, index, nextFrame);
      return {
        frame,
        translation: [
          lerp(previous.translation[0], next.translation[0], interpolateBezier(interpolation.translationX, t)),
          lerp(previous.translation[1], next.translation[1], interpolateBezier(interpolation.translationY, t)),
          lerp(previous.translation[2], next.translation[2], interpolateBezier(interpolation.translationZ, t))
        ],
        rotation: slerp(previous.rotation, next.rotation, interpolateBezier(interpolation.rotation, t)),
        physicsToggle: previous.physicsToggle
      };
    }
    previousIndex = index;
  }
  return readPackedBoneFrame(track, previousIndex, frames[previousIndex] ?? 0);
}

function samplePackedMorphTrack(track: VmdMorphTrack, frame: number): number {
  const frames = track.frames;
  if (frames.length === 0) {
    return 0;
  }
  if (frame < (frames[0] ?? 0)) {
    return track.weights[0] ?? 0;
  }
  let previousIndex = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const nextFrame = frames[index] ?? 0;
    if (frame === nextFrame) {
      return track.weights[index] ?? 0;
    }
    if (frame < nextFrame) {
      const previousFrame = frames[previousIndex] ?? 0;
      const t = interpolationRatio(previousFrame, nextFrame, frame);
      return lerp(track.weights[previousIndex] ?? 0, track.weights[index] ?? 0, t);
    }
    previousIndex = index;
  }
  return track.weights[previousIndex] ?? 0;
}

function readPackedBoneFrame(track: VmdBoneTrack, index: number, frame: number): VmdBoneFrame {
  const translationOffset = index * 3;
  const rotationOffset = index * 4;
  const physicsToggle = track.physicsToggles[index] ?? -1;
  const result: VmdBoneFrame = {
    frame,
    translation: [
      track.translations[translationOffset] ?? 0,
      track.translations[translationOffset + 1] ?? 0,
      track.translations[translationOffset + 2] ?? 0
    ],
    rotation: [
      track.rotations[rotationOffset] ?? 0,
      track.rotations[rotationOffset + 1] ?? 0,
      track.rotations[rotationOffset + 2] ?? 0,
      track.rotations[rotationOffset + 3] ?? 1
    ],
    interpolation: readPackedBoneInterpolation(track, index)
  };
  if (physicsToggle >= 0) {
    result.physicsToggle = physicsToggle;
  }
  return result;
}

function readPackedBoneInterpolation(track: VmdBoneTrack, index: number) {
  const offset = index * 16;
  return {
    translationX: readPackedCurve(track.interpolations, offset),
    translationY: readPackedCurve(track.interpolations, offset + 4),
    translationZ: readPackedCurve(track.interpolations, offset + 8),
    rotation: readPackedCurve(track.interpolations, offset + 12)
  };
}

function readPackedCurve(values: Float32Array, offset: number): [number, number, number, number] {
  return [
    values[offset] ?? 0,
    values[offset + 1] ?? 0,
    values[offset + 2] ?? 0,
    values[offset + 3] ?? 0
  ];
}

function clearNumberRecord(record: Record<string, number>): void {
  for (const key in record) {
    delete record[key];
  }
}

export { findBoneTrack, isMmdAnimation, sampleBoneTrack, sampleFramePair, sampleMorphTrack };

function interpolationRatio(previousFrame: number, nextFrame: number, frame: number): number {
  const span = nextFrame - previousFrame;
  if (span <= 0) {
    return 0;
  }
  if (span <= 1) {
    return frame >= nextFrame ? 1 : 0;
  }
  return (frame - previousFrame) / span;
}
