import { ensureFloat32ArrayLength } from "./math.js";

export function copyFloat32ArrayToScratch(
  source: Float32Array,
  scratch: Float32Array
): Float32Array<ArrayBuffer> {
  const target = ensureFloat32ArrayLength(scratch, source.length);
  target.set(source);
  return target;
}

export function resetNumberArray(target: number[]): number[] {
  target.length = 0;
  return target;
}
