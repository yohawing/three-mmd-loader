import type { MmdCameraState, MmdLightState, MmdSelfShadowState, VmdCameraFrame, VmdLightFrame, VmdSelfShadowFrame } from "../parser/model/modelTypes.js";
import { interpolateBezier, interpolationRatio, lerp } from "./math.js";

export function sampleMmdCameraTrack(
  frames: readonly VmdCameraFrame[],
  frame: number
): MmdCameraState | undefined {
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
  target: MmdCameraState,
  hint?: { index: number }
): MmdCameraState | undefined {
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
): MmdLightState | undefined {
  return sampleMmdLightTrackInto(frames, frame, {
    color: [0, 0, 0],
    direction: [0, 0, 0]
  });
}

export function sampleMmdLightTrackInto(
  frames: readonly VmdLightFrame[],
  frame: number,
  target: MmdLightState
): MmdLightState | undefined {
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
): MmdSelfShadowState | undefined {
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
  target: MmdSelfShadowState,
  hint?: { index: number }
): MmdSelfShadowState | undefined {
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
