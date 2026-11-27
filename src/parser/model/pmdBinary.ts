import type { BinaryReader } from "../binary/index.js";

export const asciiDecoder = new TextDecoder("ascii");
const shiftJisDecoder = new TextDecoder("shift-jis");
const maxPmdSectionCount = 10_000_000;

export function readCount(
  reader: BinaryReader,
  label: string,
  options: { readonly remainingBytesPerEntry?: number } = {}
): number {
  const count = reader.u32();
  validateCount(count, `PMD ${label}`, reader.remaining, options.remainingBytesPerEntry);
  return count;
}

function validateCount(
  count: number,
  label: string,
  remaining: number,
  remainingBytesPerEntry: number | undefined
): void {
  if (count > maxPmdSectionCount) {
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

export function readFixedText(reader: BinaryReader, byteLength: number): string {
  const bytes = reader.bytes(byteLength);
  const end = bytes.indexOf(0);
  const slice = end >= 0 ? bytes.subarray(0, end) : bytes;
  return shiftJisDecoder.decode(slice).trim();
}

export function normalizePmdIndex(value: number): number {
  return value === 0xffff ? -1 : value;
}
