import { createAlphaStats, recordAlphaSample, evaluateAlphaStats } from "./texture-alpha.js";
import type { MmdMaterialTransparencyMode, MmdTextureAlphaEvaluationOptions } from "./texture-alpha.js";
import { isMmdBmpLikeTexturePath } from "./texture-source.js";

export function evaluateMmdBmpTextureAlpha(
  bytes: ArrayBuffer | ArrayLike<number>,
  options: MmdTextureAlphaEvaluationOptions = {}
): MmdMaterialTransparencyMode | undefined {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (data.length < 54 || data[0] !== 0x42 || data[1] !== 0x4d) {
    return undefined;
  }
  const view =
    bytes instanceof ArrayBuffer ? new DataView(bytes) : new DataView(Uint8Array.from(data).buffer);
  const pixelOffset = view.getUint32(10, true);
  const dibHeaderSize = view.getUint32(14, true);
  const width = view.getInt32(18, true);
  const height = view.getInt32(22, true);
  const planes = view.getUint16(26, true);
  const bitsPerPixel = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  const imageSize = view.getUint32(34, true);
  const absoluteHeight = Math.abs(height);
  if (
    dibHeaderSize < 40 ||
    width <= 0 ||
    absoluteHeight <= 0 ||
    planes !== 1 ||
    (compression !== 0 &&
      compression !== 1 &&
      compression !== 2 &&
      compression !== 3 &&
      compression !== 6)
  ) {
    return undefined;
  }
  if ((compression === 1 && bitsPerPixel === 8) || (compression === 2 && bitsPerPixel === 4)) {
    if (pixelOffset >= data.length || (imageSize > 0 && pixelOffset + imageSize > data.length)) {
      return undefined;
    }
    return "opaque";
  }
  if (
    bitsPerPixel === 1 ||
    bitsPerPixel === 4 ||
    bitsPerPixel === 8 ||
    bitsPerPixel === 16 ||
    bitsPerPixel === 24
  ) {
    if (compression !== 0) {
      if (bitsPerPixel === 16 && (compression === 3 || compression === 6)) {
        return evaluateBmp16BitfieldAlpha(
          view,
          data.length,
          pixelOffset,
          width,
          absoluteHeight,
          options
        );
      }
      return undefined;
    }
    const rowSize = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
    return pixelOffset + rowSize * absoluteHeight <= data.length ? "opaque" : undefined;
  }
  if (bitsPerPixel !== 32 || pixelOffset >= data.length) {
    return undefined;
  }
  const pixelCount = width * absoluteHeight;
  if (pixelOffset + pixelCount * 4 > data.length) {
    return undefined;
  }
  const stats = createAlphaStats();
  if (compression === 3 || compression === 6) {
    const alphaMask = readBmpBitfieldAlphaMask(view, dibHeaderSize, pixelOffset);
    if (alphaMask === undefined) {
      return undefined;
    }
    if (alphaMask === 0) {
      return "opaque";
    }
    const alphaShift = trailingZeroBits(alphaMask);
    const alphaMax = alphaMask >>> alphaShift;
    for (let index = 0; index < pixelCount; index += 1) {
      const value = view.getUint32(pixelOffset + index * 4, true);
      recordAlphaSample(
        stats,
        Math.round((((value & alphaMask) >>> alphaShift) / alphaMax) * 255)
      );
    }
  } else {
    for (let index = 0; index < pixelCount; index += 1) {
      recordAlphaSample(stats, data[pixelOffset + index * 4 + 3] ?? 255);
    }
  }
  return evaluateAlphaStats(stats, options);
}

export function injectMmdBmp32BitAlphaHeader(
  bytes: ArrayBuffer | ArrayLike<number>
): Uint8Array | undefined {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
  if (data.length < 54 || data[0] !== 0x42 || data[1] !== 0x4d) {
    return undefined;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const dibHeaderSize = view.getUint32(14, true);
  const pixelOffset = view.getUint32(10, true);
  const bitsPerPixel = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (
    dibHeaderSize !== 40 ||
    bitsPerPixel !== 32 ||
    compression !== 0 ||
    pixelOffset < 54 ||
    pixelOffset >= data.length
  ) {
    return undefined;
  }
  const injected = new Uint8Array(data.length + bmpV4HeaderExtension.length);
  injected.set(data.subarray(0, 54), 0);
  injected.set(bmpV4HeaderExtension, 54);
  injected.set(data.subarray(54), 54 + bmpV4HeaderExtension.length);
  const injectedView = new DataView(injected.buffer);
  injectedView.setUint32(2, injected.length, true);
  injectedView.setUint32(10, pixelOffset + bmpV4HeaderExtension.length, true);
  injectedView.setUint32(14, 40 + bmpV4HeaderExtension.length, true);
  injectedView.setUint32(30, 3, true);
  return injected;
}

export async function createTextureLoadRequest(
  resolved: string | URL | Blob,
  texturePath: string
): Promise<{ url: string; alphaMode?: MmdMaterialTransparencyMode; revokeUrl?: boolean }> {
  if (typeof Blob !== "undefined" && resolved instanceof Blob) {
    if (!isMmdBmpLikeTexturePath(texturePath)) {
      return { url: URL.createObjectURL(resolved), revokeUrl: true };
    }
    const buffer = await resolved.arrayBuffer();
    const injected = injectMmdBmp32BitAlphaHeader(buffer);
    return {
      url: URL.createObjectURL(
        injected
          ? new Blob([injected.buffer as ArrayBuffer], {
              type: "image/bmp"
            })
          : resolved
      ),
      alphaMode: evaluateMmdBmpTextureAlpha(buffer),
      revokeUrl: true
    };
  }
  const url = String(resolved);
  if (!isMmdBmpLikeTexturePath(texturePath)) {
    return { url };
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { url };
    }
    const buffer = await response.arrayBuffer();
    const injected = injectMmdBmp32BitAlphaHeader(buffer);
    const alphaMode = evaluateMmdBmpTextureAlpha(buffer);
    if (!injected) {
      return { url, alphaMode };
    }
    return {
      url: URL.createObjectURL(new Blob([injected.buffer as ArrayBuffer], { type: "image/bmp" })),
      alphaMode,
      revokeUrl: true
    };
  } catch {
    return { url };
  }
}

function evaluateBmp16BitfieldAlpha(
  view: DataView,
  dataLength: number,
  pixelOffset: number,
  width: number,
  absoluteHeight: number,
  options: MmdTextureAlphaEvaluationOptions
): MmdMaterialTransparencyMode | undefined {
  const rowSize = Math.floor((16 * width + 31) / 32) * 4;
  if (pixelOffset + rowSize * absoluteHeight > dataLength) {
    return undefined;
  }
  const alphaMask = readBmpBitfieldAlphaMask(view, view.getUint32(14, true), pixelOffset);
  if (alphaMask === undefined || alphaMask === 0) {
    return "opaque";
  }
  const alphaShift = trailingZeroBits(alphaMask);
  const alphaMax = alphaMask >>> alphaShift;
  const stats = createAlphaStats();
  for (let y = 0; y < absoluteHeight; y += 1) {
    const rowOffset = pixelOffset + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      const value = view.getUint16(rowOffset + x * 2, true);
      recordAlphaSample(
        stats,
        Math.round((((value & alphaMask) >>> alphaShift) / alphaMax) * 255)
      );
    }
  }
  return evaluateAlphaStats(stats, options);
}

const bmpV4HeaderExtension = new Uint8Array([
  0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
]);

function readBmpBitfieldAlphaMask(
  view: DataView,
  dibHeaderSize: number,
  pixelOffset: number
): number | undefined {
  const maskOffset = 14 + 40;
  const alphaMaskOffset = maskOffset + 12;
  if (dibHeaderSize >= 56 && 14 + dibHeaderSize >= alphaMaskOffset + 4) {
    return view.getUint32(alphaMaskOffset, true);
  }
  if (pixelOffset >= alphaMaskOffset + 4) {
    return view.getUint32(alphaMaskOffset, true);
  }
  return undefined;
}

function trailingZeroBits(value: number): number {
  let shift = 0;
  while (shift < 32 && ((value >>> shift) & 1) === 0) {
    shift += 1;
  }
  return shift;
}
