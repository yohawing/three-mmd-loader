import type { MmdAnimation } from "../parser/model/modelTypes.js";

export function findPropertyFrameIndex(
  frames: readonly MmdAnimation["propertyFrames"][number][],
  frame: number
): number {
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const middleFrame = frames[middle]?.frame ?? Number.POSITIVE_INFINITY;
    if (middleFrame <= frame) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, high);
}
