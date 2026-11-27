import type { MmdFrameState } from "./types.js";

export type MutableFrameState = {
  -readonly [K in keyof MmdFrameState]: MmdFrameState[K];
};

export function createFrameState(seconds: number, frameRate: number): MmdFrameState {
  return writeFrameState(
    {
      seconds: 0,
      frame: 0,
      frameRate: 30
    },
    seconds,
    frameRate
  );
}

export function writeFrameState(
  target: MutableFrameState,
  seconds: number,
  frameRate: number
): MutableFrameState {
  if (!Number.isFinite(seconds)) {
    throw new RangeError("MMD runtime seconds must be finite");
  }
  target.seconds = seconds;
  target.frame = seconds * frameRate;
  target.frameRate = frameRate;
  return target;
}

export function copyFrameStateInto(
  target: MutableFrameState,
  source: MmdFrameState
): MmdFrameState {
  target.seconds = source.seconds;
  target.frame = source.frame;
  target.frameRate = source.frameRate;
  return target;
}
