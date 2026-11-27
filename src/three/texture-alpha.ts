import type * as THREE from "three";

export type MmdMaterialTransparencyMode = "opaque" | "alphaTest" | "alphaBlend";

export interface MmdTextureAlphaEvaluationOptions {
  readonly alphaThreshold?: number;
  readonly alphaBlendThreshold?: number;
}

interface AlphaStats {
  minAlpha: number;
  maxAlpha: number;
  middleAlphaTotal: number;
  middleAlphaCount: number;
  solidAlphaCount: number;
  sampleCount: number;
}

export function createAlphaStats(): AlphaStats {
  return {
    minAlpha: 255,
    maxAlpha: 0,
    middleAlphaTotal: 0,
    middleAlphaCount: 0,
    solidAlphaCount: 0,
    sampleCount: 0
  };
}

export function recordAlphaSample(stats: AlphaStats, alpha: number | undefined): void {
  if (!Number.isFinite(alpha)) {
    return;
  }
  const value = alpha as number;
  stats.sampleCount += 1;
  stats.minAlpha = Math.min(stats.minAlpha, value);
  stats.maxAlpha = Math.max(stats.maxAlpha, value);
  if (value > 0 && value < 255) {
    stats.middleAlphaTotal += value;
    stats.middleAlphaCount += 1;
  }
  if (value >= SOLID_ALPHA_MIN) {
    stats.solidAlphaCount += 1;
  }
}

// T070-20 soft-alpha-dominance thresholds.
// SOLID_ALPHA_MIN: alpha value at/above which a sample is considered "solid"
// (fully or near-fully opaque) rather than a soft/AA edge value.
const SOLID_ALPHA_MIN = 250;
// SOFT_DOMINANCE_RATIO: among visible pixels (middle + solid, excluding alpha=0),
// the fraction that must be "middle" for the texture to be treated as a soft
// overlay rather than a hard cutout with AA edges.
const SOFT_DOMINANCE_RATIO = 0.75;
// SOFT_OCCUPANCY_MIN: the middle-alpha population must also cover at least this
// fraction of ALL samples (including alpha=0) so that a handful of stray
// mid-range texels near a huge alpha=0 field can't trigger promotion.
const SOFT_OCCUPANCY_MIN = 0.005;

export function evaluateAlphaStats(
  stats: AlphaStats,
  options: MmdTextureAlphaEvaluationOptions
): MmdMaterialTransparencyMode {
  const alphaThreshold = options.alphaThreshold ?? 195;
  const alphaBlendThreshold = options.alphaBlendThreshold ?? 100;
  const averageMiddleAlpha =
    stats.middleAlphaCount > 0 ? stats.middleAlphaTotal / stats.middleAlphaCount : 0;
  if (stats.sampleCount === 0 || stats.minAlpha >= alphaThreshold) {
    return "opaque";
  }
  if (stats.middleAlphaCount / stats.sampleCount >= 0.25) {
    return "alphaBlend";
  }
  // Soft-alpha-dominance promotion (T070-20): cutouts have solid-dominated
  // visible pixels with only anti-aliased edges falling in the middle range;
  // soft overlays (e.g. cheek blush) have middle-dominated visible pixels with
  // near-zero solid population. Alpha=0 samples are excluded from the
  // dominance ratio's denominator so transparent atlas padding cannot inflate
  // it into a false promotion (preserves the existing atlas-padding contract).
  if (
    stats.middleAlphaCount > 0 &&
    stats.middleAlphaCount / (stats.middleAlphaCount + stats.solidAlphaCount) >=
      SOFT_DOMINANCE_RATIO &&
    stats.middleAlphaCount / stats.sampleCount >= SOFT_OCCUPANCY_MIN
  ) {
    return "alphaBlend";
  }
  return averageMiddleAlpha + alphaBlendThreshold < stats.maxAlpha ? "alphaTest" : "alphaBlend";
}

export function evaluateMmdTextureAlphaSamples(
  alphaSamples: ArrayLike<number>,
  options: MmdTextureAlphaEvaluationOptions = {}
): MmdMaterialTransparencyMode {
  const stats = createAlphaStats();
  for (let index = 0; index < alphaSamples.length; index += 1) {
    recordAlphaSample(stats, alphaSamples[index]);
  }
  return evaluateAlphaStats(stats, options);
}

export function evaluateMmdTextureTransparencySamples(
  alphaSamples: ArrayLike<number>,
  options: MmdTextureAlphaEvaluationOptions = {}
): MmdMaterialTransparencyMode {
  const stats = createAlphaStats();
  for (let index = 0; index < alphaSamples.length; index += 1) {
    const alpha = alphaSamples[index];
    if (!Number.isFinite(alpha)) {
      continue;
    }
    recordAlphaSample(stats, 255 - alpha);
  }
  return evaluateAlphaStats(stats, options);
}

export function evaluateMmdTextureAlphaRgba(
  rgbaPixels: ArrayLike<number>,
  options: MmdTextureAlphaEvaluationOptions = {}
): MmdMaterialTransparencyMode {
  const stats = createAlphaStats();
  for (let index = 3; index < rgbaPixels.length; index += 4) {
    recordAlphaSample(stats, rgbaPixels[index]);
  }
  return evaluateAlphaStats(stats, options);
}

export function evaluateMmdTextureAlphaTexture(
  texture: THREE.Texture,
  options: MmdTextureAlphaEvaluationOptions = {}
): MmdMaterialTransparencyMode | undefined {
  const metadataAlphaMode = texture.userData.mmdTextureAlphaMode as
    | MmdMaterialTransparencyMode
    | undefined;
  if (metadataAlphaMode) {
    return metadataAlphaMode;
  }
  const image = texture.image as
    | { data?: ArrayLike<number>; width?: number; height?: number }
    | undefined;
  const data = image?.data;
  if (!data || data.length === 0) {
    return evaluateMmdTextureAlphaCanvasImage(image, options);
  }
  const pixelCount =
    Number.isFinite(image?.width) && Number.isFinite(image?.height)
      ? Math.max(0, Number(image?.width) * Number(image?.height))
      : Math.floor(data.length / 4);
  if (pixelCount <= 0 || data.length < pixelCount * 4) {
    return evaluateMmdTextureAlphaCanvasImage(image, options);
  }
  return evaluateMmdTextureAlphaRgba(data, options);
}

export function evaluateMmdTextureAlphaGeometry(
  texture: THREE.Texture,
  geometry: THREE.BufferGeometry,
  materialIndex: number,
  options: MmdTextureAlphaEvaluationOptions = {}
): MmdMaterialTransparencyMode | undefined {
  const metadataAlphaMode = texture.userData.mmdTextureAlphaMode as
    | MmdMaterialTransparencyMode
    | undefined;
  if (metadataAlphaMode) {
    return metadataAlphaMode;
  }
  const image = texture.image as
    | { data?: ArrayLike<number>; width?: number; height?: number }
    | undefined;
  const rgba = readableRgbaTextureData(image);
  if (!rgba || !hasAnyReadableAlpha(rgba.data, rgba.width, rgba.height)) {
    return undefined;
  }
  const uvAttribute = geometry.getAttribute("uv");
  if (!uvAttribute) {
    return undefined;
  }
  const groups = geometry.groups.filter((group) => group.materialIndex === materialIndex);
  if (groups.length === 0) {
    return undefined;
  }
  const indexArray = geometry.index?.array;
  const stats = createAlphaStats();
  const resolution = 512;
  for (const group of groups) {
    for (let offset = group.start; offset < group.start + group.count; offset += 3) {
      const a = Number(indexArray?.[offset] ?? offset);
      const b = Number(indexArray?.[offset + 1] ?? offset + 1);
      const c = Number(indexArray?.[offset + 2] ?? offset + 2);
      recordRasterizedUvTriangleAlpha(
        stats,
        rgba.data,
        rgba.width,
        rgba.height,
        uvAttribute.getX(a),
        uvAttribute.getY(a),
        uvAttribute.getX(b),
        uvAttribute.getY(b),
        uvAttribute.getX(c),
        uvAttribute.getY(c),
        resolution
      );
    }
  }
  return stats.sampleCount > 0 ? evaluateAlphaStats(stats, options) : undefined;
}

function readableRgbaTextureData(
  image: { data?: ArrayLike<number>; width?: number; height?: number } | undefined
): { data: ArrayLike<number>; width: number; height: number } | undefined {
  const width = Number(image?.width);
  const height = Number(image?.height);
  const data = image?.data;
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    if (data && data.length >= width * height * 4) {
      return { data, width, height };
    }
    return readableRgbaCanvasImage(image, width, height);
  }
  return undefined;
}

function readableRgbaCanvasImage(
  image: unknown,
  width: number,
  height: number
): { data: ArrayLike<number>; width: number; height: number } | undefined {
  try {
    if (typeof document === "undefined") {
      return undefined;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return undefined;
    }
    context.drawImage(image as CanvasImageSource, 0, 0, width, height);
    return { data: context.getImageData(0, 0, width, height).data, width, height };
  } catch {
    return undefined;
  }
}

function hasAnyReadableAlpha(rgba: ArrayLike<number>, width: number, height: number): boolean {
  const pixelCount = width * height;
  for (let index = 0; index < pixelCount; index += 1) {
    if ((rgba[index * 4 + 3] ?? 255) < 255) {
      return true;
    }
  }
  return false;
}

function sampleRgbaAlphaByUv(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  uvX: number,
  uvY: number
): number {
  const wrap = (value: number, size: number) => {
    let wrapped = Math.round(value * size) % size;
    if (wrapped < 0) {
      wrapped += size;
    }
    return wrapped;
  };
  const x = wrap(uvX, width);
  const y = wrap(uvY, height);
  return rgba[(y * width + x) * 4 + 3] ?? 255;
}

function recordRasterizedUvTriangleAlpha(
  stats: AlphaStats,
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  uvAX: number,
  uvAY: number,
  uvBX: number,
  uvBY: number,
  uvCX: number,
  uvCY: number,
  resolution: number
): void {
  const minU = Math.min(uvAX, uvBX, uvCX);
  const maxU = Math.max(uvAX, uvBX, uvCX);
  const minV = Math.min(uvAY, uvBY, uvCY);
  const maxV = Math.max(uvAY, uvBY, uvCY);
  const shiftMinU = Math.ceil(-maxU);
  const shiftMaxU = Math.floor(1 - minU);
  const shiftMinV = Math.ceil(-maxV);
  const shiftMaxV = Math.floor(1 - minV);
  for (let shiftU = shiftMinU; shiftU <= shiftMaxU; shiftU += 1) {
    for (let shiftV = shiftMinV; shiftV <= shiftMaxV; shiftV += 1) {
      recordRasterizedUvTriangleAlphaTile(
        stats,
        rgba,
        width,
        height,
        uvAX + shiftU,
        uvAY + shiftV,
        uvBX + shiftU,
        uvBY + shiftV,
        uvCX + shiftU,
        uvCY + shiftV,
        resolution
      );
    }
  }
}

function recordRasterizedUvTriangleAlphaTile(
  stats: AlphaStats,
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  uvAX: number,
  uvAY: number,
  uvBX: number,
  uvBY: number,
  uvCX: number,
  uvCY: number,
  resolution: number
): void {
  const ax = uvAX * resolution;
  const ay = uvAY * resolution;
  const bx = uvBX * resolution;
  const by = uvBY * resolution;
  const cx = uvCX * resolution;
  const cy = uvCY * resolution;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(resolution - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(resolution - 1, Math.ceil(Math.max(ay, by, cy)));
  if (minX > maxX || minY > maxY) {
    return;
  }
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denominator) < 1e-9) {
    return;
  }
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const wA = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denominator;
      const wB = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denominator;
      const wC = 1 - wA - wB;
      if (wA >= 0 && wB >= 0 && wC >= 0) {
        recordAlphaSample(stats, sampleRgbaAlphaByUv(rgba, width, height, px / resolution, py / resolution));
      }
    }
  }
}

function evaluateMmdTextureAlphaCanvasImage(
  image: unknown,
  options: MmdTextureAlphaEvaluationOptions
): MmdMaterialTransparencyMode | undefined {
  if (
    typeof document === "undefined" ||
    !image ||
    typeof image !== "object" ||
    !("width" in image) ||
    !("height" in image)
  ) {
    return undefined;
  }
  const width = Number((image as { width: unknown }).width);
  const height = Number((image as { height: unknown }).height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return undefined;
    }
    context.drawImage(image as CanvasImageSource, 0, 0, width, height);
    return evaluateMmdTextureAlphaRgba(context.getImageData(0, 0, width, height).data, options);
  } catch {
    return undefined;
  }
}
