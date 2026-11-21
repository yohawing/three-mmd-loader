import type { VmdBoneFrame, VmdBoneTrack, VmdMorphTrack } from "../parser/model/modelTypes.js";
import { interpolateBezier, interpolationRatio, lerp, slerp } from "./math.js";

export interface BoneSampleScratch {
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

export function sampleBoneTrack(
  frames: VmdBoneTrack | undefined,
  frame: number
): VmdBoneFrame | undefined {
  if (!frames) {
    return undefined;
  }
  return samplePackedBoneTrack(frames, frame);
}

export function sampleBoneTrackInto(
  track: VmdBoneTrack | undefined,
  frame: number,
  target: BoneSampleScratch
): BoneSampleScratch | undefined {
  if (!track || !samplePackedBoneTrackInto(track, frame, target)) {
    return undefined;
  }
  return target;
}

export function sampleMorphTrack(frames: VmdMorphTrack, frame: number): number {
  return samplePackedMorphTrack(frames, frame);
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
