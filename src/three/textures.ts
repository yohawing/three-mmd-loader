import type { MaterialInfo } from "../parser/model/modelTypes.js";
import * as THREE from "three";

import type { TextureLoadDiagnostic, ThreeMmdTextureLoader } from "./materials.js";

export interface TextureResolver {
  resolve(path: string, modelUrl?: string): Promise<string | URL | Blob | undefined>;
}

export type TextureMap = Record<string, string | URL | Blob>;

export interface MmdToonTextureReference {
  readonly path: string;
  readonly textureInfo?: MaterialInfo["toonTextureInfo"];
  readonly shared: boolean;
}

export interface MmdToonTextureMaterial {
  readonly toonTexturePath?: string;
  readonly toonTextureInfo?: MaterialInfo["toonTextureInfo"];
  readonly sharedToonIndex?: number;
}

export type MmdMaterialTransparencyMode = "opaque" | "alphaTest" | "alphaBlend";

export interface MmdTextureAlphaEvaluationOptions {
  readonly alphaThreshold?: number;
  readonly alphaBlendThreshold?: number;
}

export function evaluateMmdTextureAlphaSamples(
  alphaSamples: ArrayLike<number>,
  options: MmdTextureAlphaEvaluationOptions = {}
): MmdMaterialTransparencyMode {
  const alphaThreshold = options.alphaThreshold ?? 195;
  const alphaBlendThreshold = options.alphaBlendThreshold ?? 100;
  let maxAlpha = 0;
  let middleAlphaTotal = 0;
  let middleAlphaCount = 0;
  for (let index = 0; index < alphaSamples.length; index += 1) {
    const alpha = alphaSamples[index];
    if (!Number.isFinite(alpha)) {
      continue;
    }
    maxAlpha = Math.max(maxAlpha, alpha);
    if (alpha > 0 && alpha < 255) {
      middleAlphaTotal += alpha;
      middleAlphaCount += 1;
    }
  }
  const averageMiddleAlpha = middleAlphaCount > 0 ? middleAlphaTotal / middleAlphaCount : 0;
  if (maxAlpha < alphaThreshold) {
    return "opaque";
  }
  return averageMiddleAlpha + alphaBlendThreshold < maxAlpha ? "alphaTest" : "alphaBlend";
}

export function evaluateMmdTextureTransparencySamples(
  alphaSamples: ArrayLike<number>,
  options: MmdTextureAlphaEvaluationOptions = {}
): MmdMaterialTransparencyMode {
  const alphaThreshold = options.alphaThreshold ?? 195;
  const alphaBlendThreshold = options.alphaBlendThreshold ?? 100;
  let maxTransparency = 0;
  let middleTransparencyTotal = 0;
  let middleTransparencyCount = 0;
  for (let index = 0; index < alphaSamples.length; index += 1) {
    const alpha = alphaSamples[index];
    if (!Number.isFinite(alpha)) {
      continue;
    }
    const transparency = 255 - alpha;
    maxTransparency = Math.max(maxTransparency, transparency);
    if (transparency > 0 && transparency < 255) {
      middleTransparencyTotal += transparency;
      middleTransparencyCount += 1;
    }
  }
  if (maxTransparency < alphaThreshold) {
    return "opaque";
  }
  const averageMiddleTransparency =
    middleTransparencyCount > 0 ? middleTransparencyTotal / middleTransparencyCount : 0;
  return averageMiddleTransparency + alphaBlendThreshold < maxTransparency
    ? "alphaTest"
    : "alphaBlend";
}

export function evaluateMmdTextureAlphaRgba(
  rgbaPixels: ArrayLike<number>,
  options: MmdTextureAlphaEvaluationOptions = {}
): MmdMaterialTransparencyMode {
  const alphaSamples: number[] = [];
  for (let index = 3; index < rgbaPixels.length; index += 4) {
    alphaSamples.push(rgbaPixels[index]);
  }
  return evaluateMmdTextureAlphaSamples(alphaSamples, options);
}

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
  const alphaSamples: number[] = [];
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
      alphaSamples.push(Math.round((((value & alphaMask) >>> alphaShift) / alphaMax) * 255));
    }
  } else {
    for (let index = 0; index < pixelCount; index += 1) {
      alphaSamples.push(data[pixelOffset + index * 4 + 3] ?? 255);
    }
  }
  return evaluateMmdTextureAlphaSamples(alphaSamples, options);
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
  const alphaSamples: number[] = [];
  const resolution = 512;
  for (const group of groups) {
    for (let offset = group.start; offset < group.start + group.count; offset += 3) {
      const a = Number(indexArray?.[offset] ?? offset);
      const b = Number(indexArray?.[offset + 1] ?? offset + 1);
      const c = Number(indexArray?.[offset + 2] ?? offset + 2);
      pushRasterizedUvTriangleTransparency(
        alphaSamples,
        rgba.data,
        rgba.width,
        rgba.height,
        [uvAttribute.getX(a), uvAttribute.getY(a)],
        [uvAttribute.getX(b), uvAttribute.getY(b)],
        [uvAttribute.getX(c), uvAttribute.getY(c)],
        resolution
      );
    }
  }
  return alphaSamples.length > 0
    ? evaluateMmdTextureAlphaSamples(alphaSamples, options)
    : undefined;
}

export async function loadToonTexture(
  material: Pick<
    MaterialInfo,
    "toonTexturePath" | "toonTextureInfo" | "sharedToonIndex"
  >,
  materialIndex: number,
  modelUrl: string | undefined,
  textureResolver: TextureResolver | undefined,
  textureDiagnostics: TextureLoadDiagnostic[],
  textureLoader?: ThreeMmdTextureLoader
): Promise<THREE.Texture | undefined> {
  const toonTexture = resolveMmdToonTextureReference(material);
  if (!toonTexture.path) {
    return undefined;
  }
  const isBuiltInToon =
    isBuiltInToonTexturePath(toonTexture.path) &&
    (toonTexture.shared || toonTexture.textureInfo === undefined);
  const texture =
    (isBuiltInToon
      ? await loadBuiltInToonBmpTexture(toonTexture.path, modelUrl, textureResolver)
      : undefined) ??
    (await loadMaterialTexture(
      toonTexture.path,
      toonTexture.textureInfo,
      modelUrl,
      textureResolver,
      textureLoader
    ));
  if (!texture && material.toonTexturePath && !isBuiltInToonTexturePath(material.toonTexturePath)) {
    textureDiagnostics.push({
      level: "warning",
      code: "TEXTURE_RESOLVE_FAILED",
      materialIndex,
      textureKind: "toon",
      path: material.toonTexturePath
    });
  }
  if (!texture && !material.toonTexturePath && toonTexture.shared && !textureResolver && !modelUrl) {
    textureDiagnostics.push({
      level: "warning",
      code: "TEXTURE_RESOLVE_FAILED",
      materialIndex,
      textureKind: "toon",
      path: toonTexture.path
    });
  }
  if (!texture && !textureResolver && !modelUrl && !material.toonTexturePath) {
    return undefined;
  }
  if (!texture) {
    return toonGradient();
  }
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = true;
  texture.userData.mmdToonTexturePath = toonTexture.path;
  texture.userData.mmdToonTextureShared = toonTexture.shared;
  if (isBuiltInToon) {
    texture.userData.mmdBuiltInToonTexture = true;
  }
  return texture;
}

export function rotateMmdToonTexture(texture: THREE.Texture): THREE.Texture {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = Number(image?.width);
  const height = Number(image?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return texture;
  }
  if (texture instanceof THREE.DataTexture && image && "data" in image) {
    const sourceData = (image as { data?: ArrayLike<number> }).data;
    if (sourceData && sourceData.length >= width * height * 4) {
      const rotated = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const source = (y * width + x) * 4;
          const targetX = height - 1 - y;
          const targetY = x;
          const target = (targetY * height + targetX) * 4;
          rotated[target] = sourceData[source] ?? 0;
          rotated[target + 1] = sourceData[source + 1] ?? 0;
          rotated[target + 2] = sourceData[source + 2] ?? 0;
          rotated[target + 3] = sourceData[source + 3] ?? 255;
        }
      }
      texture.image = { data: rotated, width: height, height: width };
      texture.userData.mmdToonTextureRotated = true;
      texture.needsUpdate = true;
    }
    return texture;
  }
  if (typeof document === "undefined") {
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return texture;
  }
  context.clearRect(0, 0, width, height);
  context.translate(width / 2, height / 2);
  context.rotate(Math.PI / 2);
  context.translate(-width / 2, -height / 2);
  context.drawImage(texture.image as CanvasImageSource, 0, 0);
  texture.image = context.getImageData(0, 0, width, height);
  texture.userData.mmdToonTextureRotated = true;
  texture.needsUpdate = true;
  return texture;
}

export async function loadMaterialTextureWithDiagnostics(
  texturePath: string,
  textureInfo: MaterialInfo["textureInfo"],
  textureKind: TextureLoadDiagnostic["textureKind"],
  materialIndex: number,
  modelUrl: string | undefined,
  textureResolver: TextureResolver | undefined,
  textureDiagnostics: TextureLoadDiagnostic[],
  textureLoader?: ThreeMmdTextureLoader
): Promise<THREE.Texture | undefined> {
  const texture = await loadMaterialTexture(
    texturePath,
    textureInfo,
    modelUrl,
    textureResolver,
    textureLoader
  );
  if (!texture && texturePath) {
    textureDiagnostics.push({
      level: "warning",
      code: "TEXTURE_RESOLVE_FAILED",
      materialIndex,
      textureKind,
      path: texturePath
    });
  }
  return texture;
}

export function configureMmdTexture(
  texture: THREE.Texture,
  textureInfo?: MaterialInfo["textureInfo"]
): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = textureInfo?.invertY ?? false;
  if (textureInfo?.noMipmap) {
    texture.generateMipmaps = false;
  }
  if (textureInfo) {
    texture.userData.mmdTextureInfo = { ...textureInfo };
  }
  texture.needsUpdate = true;
  return texture;
}

export function decodeMmdTgaTexture(
  bytes: ArrayBuffer | ArrayLike<number>
): { data: Uint8Array; width: number; height: number; hasAlpha: boolean } | undefined {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
  if (data.length < 18) {
    return undefined;
  }
  const idLength = data[0] ?? 0;
  const colorMapType = data[1] ?? 0;
  const imageType = data[2] ?? 0;
  const width = (data[12] ?? 0) | ((data[13] ?? 0) << 8);
  const height = (data[14] ?? 0) | ((data[15] ?? 0) << 8);
  const bitsPerPixel = data[16] ?? 0;
  const descriptor = data[17] ?? 0;
  if (
    colorMapType !== 0 ||
    (imageType !== 2 && imageType !== 10) ||
    width <= 0 ||
    height <= 0 ||
    (bitsPerPixel !== 24 && bitsPerPixel !== 32)
  ) {
    return undefined;
  }
  const bytesPerPixel = bitsPerPixel / 8;
  const pixelOffset = 18 + idLength;
  if (data.length < pixelOffset) {
    return undefined;
  }
  const output = new Uint8Array(width * height * 4);
  const topOrigin = (descriptor & 0x20) !== 0;
  let hasAlpha = false;
  const writePixel = (sourcePixelIndex: number, source: number): boolean => {
    if (source + bytesPerPixel > data.length) {
      return false;
    }
    const sourceY = Math.floor(sourcePixelIndex / width);
    const x = sourcePixelIndex % width;
    const targetY = topOrigin ? sourceY : height - 1 - sourceY;
    const target = (targetY * width + x) * 4;
    output[target] = data[source + 2] ?? 0;
    output[target + 1] = data[source + 1] ?? 0;
    output[target + 2] = data[source] ?? 0;
    const alpha = bitsPerPixel === 32 ? (data[source + 3] ?? 255) : 255;
    output[target + 3] = alpha;
    hasAlpha ||= alpha < 255;
    return true;
  };
  const pixelCount = width * height;
  if (imageType === 2) {
    const pixelByteLength = pixelCount * bytesPerPixel;
    if (data.length < pixelOffset + pixelByteLength) {
      return undefined;
    }
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      if (!writePixel(pixelIndex, pixelOffset + pixelIndex * bytesPerPixel)) {
        return undefined;
      }
    }
  } else {
    let source = pixelOffset;
    let pixelIndex = 0;
    while (pixelIndex < pixelCount) {
      if (source >= data.length) {
        return undefined;
      }
      const packet = data[source++] ?? 0;
      const count = (packet & 0x7f) + 1;
      if ((packet & 0x80) !== 0) {
        if (source + bytesPerPixel > data.length) {
          return undefined;
        }
        for (let i = 0; i < count && pixelIndex < pixelCount; i += 1, pixelIndex += 1) {
          if (!writePixel(pixelIndex, source)) {
            return undefined;
          }
        }
        source += bytesPerPixel;
      } else {
        for (let i = 0; i < count && pixelIndex < pixelCount; i += 1, pixelIndex += 1) {
          if (!writePixel(pixelIndex, source)) {
            return undefined;
          }
          source += bytesPerPixel;
        }
      }
    }
  }
  return { data: output, width, height, hasAlpha };
}

export function isMmdBmpLikeTexturePath(texturePath: string): boolean {
  return /\.(?:bmp|spa|sph)$/i.test(texturePath);
}

export function isMmdTgaLikeTexturePath(texturePath: string): boolean {
  return /\.tga$/i.test(texturePath);
}

export function createTextureResolver(
  textureResolver?: TextureResolver,
  textureMap?: TextureMap
): TextureResolver | undefined {
  if (!textureResolver && !textureMap) {
    return undefined;
  }

  return {
    async resolve(path, modelUrl) {
      const mapped = resolveMappedTexture(path, textureMap);
      if (mapped) {
        return mapped;
      }

      return (
        (await textureResolver?.resolve(path, modelUrl)) ?? resolveAdjacentTexture(path, modelUrl)
      );
    }
  };
}

export function createMmdBuiltInToonTextureMap(baseUrl: string | URL): TextureMap {
  const map: TextureMap = {};
  const base = typeof baseUrl === "string" ? baseUrl : baseUrl.toString();
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  for (let index = 0; index < 10; index += 1) {
    const texturePath = defaultSharedToonTexturePath(index);
    map[texturePath] = isAbsoluteUrl(normalizedBase)
      ? new URL(texturePath, normalizedBase).toString()
      : `${normalizedBase}${texturePath}`;
  }

  return map;
}

export function resolveMappedTexture(
  texturePath: string,
  textureMap?: TextureMap
): string | URL | Blob | undefined {
  if (!textureMap) {
    return undefined;
  }

  const normalized = normalizeMmdTexturePath(texturePath);
  const mapped = textureMap[texturePath] ?? textureMap[normalized] ?? textureMap[`./${normalized}`];
  if (mapped) {
    return mapped;
  }

  const normalizedLower = normalized.toLowerCase();
  for (const [key, value] of Object.entries(textureMap)) {
    if (normalizeMmdTexturePath(key).toLowerCase() === normalizedLower) {
      return value;
    }
  }

  return undefined;
}

export function defaultSharedToonTexturePath(sharedToonIndex: number | undefined): string {
  return sharedToonIndex === undefined
    ? ""
    : `toon${String(sharedToonIndex + 1).padStart(2, "0")}.bmp`;
}

export function resolveMmdToonTextureReference(
  material: Pick<MaterialInfo, "toonTexturePath" | "toonTextureInfo" | "sharedToonIndex">
): MmdToonTextureReference {
  if (material.toonTexturePath) {
    return {
      path: material.toonTexturePath,
      textureInfo: material.toonTextureInfo,
      shared: false
    };
  }

  const sharedPath = defaultSharedToonTexturePath(material.sharedToonIndex);
  return {
    path: sharedPath,
    textureInfo: undefined,
    shared: sharedPath.length > 0
  };
}

export function isBuiltInToonTexturePath(texturePath: string): boolean {
  return /^toon0[1-9]\.bmp$|^toon10\.bmp$/i.test(normalizeMmdTexturePath(texturePath));
}

export function normalizeMmdTexturePath(texturePath: string): string {
  return texturePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function createFallbackMmdMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(0.8, 0.8, 0.8),
    gradientMap: toonGradient(),
    side: THREE.DoubleSide
  });
  material.name = "mmd_fallback_material";
  material.userData.mmdMaterial = {
    materialIndex: 0,
    name: "fallback",
    englishName: "fallback"
  };
  return material;
}

async function loadMaterialTexture(
  texturePath: string,
  textureInfo: MaterialInfo["textureInfo"],
  modelUrl: string | undefined,
  textureResolver: TextureResolver | undefined,
  textureLoader?: ThreeMmdTextureLoader
): Promise<THREE.Texture | undefined> {
  if (!texturePath) {
    return undefined;
  }
  const resolved = textureResolver
    ? await textureResolver.resolve(texturePath, modelUrl)
    : resolveAdjacentTexture(texturePath, modelUrl);
  if (!resolved) {
    return undefined;
  }
  if (isMmdTgaLikeTexturePath(texturePath)) {
    const tgaTexture = await loadMmdTgaTexture(resolved, textureInfo);
    if (tgaTexture) {
      return tgaTexture;
    }
  }
  const request = await createTextureLoadRequest(resolved, texturePath);
  const loader = textureLoader ?? new THREE.TextureLoader();
  return new Promise((resolve) => {
    try {
      loader.load(
        request.url,
        (texture) => {
          configureMmdTexture(texture, textureInfo);
          if (request.alphaMode) {
            texture.userData.mmdTextureAlphaMode = request.alphaMode;
          }
          resolve(texture);
        },
        undefined,
        () => resolve(undefined)
      );
    } catch {
      resolve(undefined);
    }
  });
}

async function loadBuiltInToonBmpTexture(
  texturePath: string,
  modelUrl: string | undefined,
  textureResolver: TextureResolver | undefined
): Promise<THREE.Texture | undefined> {
  try {
    const resolved = textureResolver
      ? await textureResolver.resolve(texturePath, modelUrl)
      : resolveAdjacentTexture(texturePath, modelUrl);
    if (!resolved) {
      return undefined;
    }
    const buffer =
      typeof Blob !== "undefined" && resolved instanceof Blob
        ? await resolved.arrayBuffer()
        : await fetch(String(resolved)).then((response) =>
            response.ok ? response.arrayBuffer() : undefined
          );
    if (!buffer) {
      return undefined;
    }
    const texture = decodeMmdBmpTexture(buffer);
    return texture ? configureMmdTexture(texture) : undefined;
  } catch {
    return undefined;
  }
}

async function loadMmdTgaTexture(
  resolved: string | URL | Blob,
  textureInfo: MaterialInfo["textureInfo"]
): Promise<THREE.Texture | undefined> {
  try {
    const buffer =
      typeof Blob !== "undefined" && resolved instanceof Blob
        ? await resolved.arrayBuffer()
        : await fetch(String(resolved)).then((response) =>
            response.ok ? response.arrayBuffer() : undefined
          );
    if (!buffer) {
      return undefined;
    }
    const image = decodeMmdTgaTexture(buffer);
    if (!image) {
      return undefined;
    }
    const texture = new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat);
    texture.type = THREE.UnsignedByteType;
    texture.userData.mmdTextureAlphaMode = image.hasAlpha
      ? evaluateMmdTextureAlphaRgba(image.data)
      : "opaque";
    return configureMmdTexture(texture, textureInfo);
  } catch {
    return undefined;
  }
}

async function createTextureLoadRequest(
  resolved: string | URL | Blob,
  texturePath: string
): Promise<{ url: string; alphaMode?: MmdMaterialTransparencyMode }> {
  if (typeof Blob !== "undefined" && resolved instanceof Blob) {
    if (!isMmdBmpLikeTexturePath(texturePath)) {
      return { url: URL.createObjectURL(resolved) };
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
      alphaMode: evaluateMmdBmpTextureAlpha(buffer)
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
    return {
      url: URL.createObjectURL(
        new Blob([injected ? (injected.buffer as ArrayBuffer) : buffer], {
          type: "image/bmp"
        })
      ),
      alphaMode: evaluateMmdBmpTextureAlpha(buffer)
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
  const alphaSamples: number[] = [];
  for (let y = 0; y < absoluteHeight; y += 1) {
    const rowOffset = pixelOffset + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      const value = view.getUint16(rowOffset + x * 2, true);
      alphaSamples.push(Math.round((((value & alphaMask) >>> alphaShift) / alphaMax) * 255));
    }
  }
  return evaluateMmdTextureAlphaSamples(alphaSamples, options);
}

const bmpV4HeaderExtension = new Uint8Array([
  0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
]);

function decodeMmdBmpTexture(
  bytes: ArrayBuffer | ArrayLike<number>
): THREE.DataTexture | undefined {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
  if (data.length < 54 || data[0] !== 0x42 || data[1] !== 0x4d) {
    return undefined;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const dibHeaderSize = view.getUint32(14, true);
  const width = view.getInt32(18, true);
  const height = view.getInt32(22, true);
  const planes = view.getUint16(26, true);
  const bitsPerPixel = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  const absoluteHeight = Math.abs(height);
  if (
    dibHeaderSize < 40 ||
    width <= 0 ||
    absoluteHeight <= 0 ||
    planes !== 1 ||
    compression !== 0 ||
    (bitsPerPixel !== 24 && bitsPerPixel !== 32)
  ) {
    return undefined;
  }
  const bytesPerPixel = bitsPerPixel / 8;
  const rowSize = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  if (pixelOffset + rowSize * absoluteHeight > data.length) {
    return undefined;
  }
  const rgba = new Uint8Array(width * absoluteHeight * 4);
  for (let y = 0; y < absoluteHeight; y += 1) {
    const sourceY = height > 0 ? absoluteHeight - 1 - y : y;
    const rowOffset = pixelOffset + sourceY * rowSize;
    for (let x = 0; x < width; x += 1) {
      const source = rowOffset + x * bytesPerPixel;
      const target = (y * width + x) * 4;
      rgba[target] = data[source + 2] ?? 0;
      rgba[target + 1] = data[source + 1] ?? 0;
      rgba[target + 2] = data[source] ?? 0;
      rgba[target + 3] = bitsPerPixel === 32 ? (data[source + 3] ?? 255) : 255;
    }
  }
  const texture = new THREE.DataTexture(rgba, width, absoluteHeight, THREE.RGBAFormat);
  texture.type = THREE.UnsignedByteType;
  texture.userData.mmdTextureAlphaMode =
    bitsPerPixel === 32 ? evaluateMmdTextureAlphaRgba(rgba) : "opaque";
  texture.needsUpdate = true;
  return texture;
}

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

let cachedToonGradient: THREE.DataTexture | undefined;

function toonGradient(): THREE.DataTexture {
  if (cachedToonGradient) {
    return cachedToonGradient;
  }
  const data = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.userData.mmdFallbackToonGradient = true;
  texture.needsUpdate = true;
  cachedToonGradient = texture;
  return texture;
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

function pushRasterizedUvTriangleTransparency(
  target: number[],
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  uvA: readonly [number, number],
  uvB: readonly [number, number],
  uvC: readonly [number, number],
  resolution: number
): void {
  const toPoint = (uv: readonly [number, number]): [number, number] => [
    wrapUnit(uv[0]) * resolution,
    wrapUnit(uv[1]) * resolution
  ];
  const a = toPoint(uvA);
  const b = toPoint(uvB);
  const c = toPoint(uvC);
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(resolution - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(resolution - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(denominator) < 1e-9) {
    return;
  }
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const wA = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / denominator;
      const wB = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / denominator;
      const wC = 1 - wA - wB;
      if (wA >= 0 && wB >= 0 && wC >= 0) {
        target.push(
          255 - sampleRgbaAlphaByUv(rgba, width, height, px / resolution, py / resolution)
        );
      }
    }
  }
}

function wrapUnit(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
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

function resolveAdjacentTexture(
  texturePath: string,
  modelUrl: string | undefined
): string | undefined {
  if (!modelUrl) {
    return undefined;
  }

  if (typeof location === "undefined" && !isAbsoluteUrl(modelUrl)) {
    const normalizedModelUrl = normalizeMmdTexturePath(modelUrl);
    const basePath = normalizedModelUrl.includes("/")
      ? normalizedModelUrl.slice(0, normalizedModelUrl.lastIndexOf("/") + 1)
      : "";
    return `${basePath}${normalizeMmdTexturePath(texturePath)}`;
  }

  if (typeof location === "undefined" && isAbsoluteUrl(modelUrl)) {
    return new URL(normalizeMmdTexturePath(texturePath), new URL(".", modelUrl)).toString();
  }

  return new URL(
    normalizeMmdTexturePath(texturePath),
    new URL(".", new URL(modelUrl, location.href))
  ).toString();
}

function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(url);
}
