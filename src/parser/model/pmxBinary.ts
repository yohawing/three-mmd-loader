import type { BinaryReader } from "../binary/index.js";

export interface PmxIndexSizes {
  vertex: number;
  texture: number;
  material: number;
  bone: number;
  morph: number;
  rigidBody: number;
}

export const maxPmxSectionCount = 10_000_000;

export function readCount(
  reader: BinaryReader,
  label: string,
  options: { readonly remainingBytesPerEntry?: number } = {}
): number {
  const count = reader.i32();
  validateCount(count, `PMX ${label}`, reader.remaining, options.remainingBytesPerEntry);
  return count;
}

function validateCount(
  count: number,
  label: string,
  remaining: number,
  remainingBytesPerEntry: number | undefined
): void {
  if (count < 0 || count > maxPmxSectionCount) {
    throw new Error(`Invalid ${label} count: ${count}`);
  }
  if (remainingBytesPerEntry === undefined) {
    return;
  }
  const minimumByteLength = count * remainingBytesPerEntry;
  if (!Number.isSafeInteger(minimumByteLength) || minimumByteLength > remaining) {
    throw new Error(`Invalid ${label} count: ${count}`);
  }
}

export function readVertexIndex(reader: BinaryReader, size: number): number {
  switch (size) {
    case 1:
      return reader.u8();
    case 2:
      return reader.u16();
    case 4:
      return reader.i32();
    default:
      throw new Error(`Unsupported PMX vertex index size: ${size}`);
  }
}

export function readVec3(reader: BinaryReader): [number, number, number] {
  return [reader.f32(), reader.f32(), reader.f32()];
}

export function readVec4(reader: BinaryReader): [number, number, number, number] {
  return [reader.f32(), reader.f32(), reader.f32(), reader.f32()];
}
