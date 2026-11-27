import * as THREE from "three";
import type { MaterialInfo } from "../parser/model/modelTypes.js";
import type { TextureLoadDiagnostic, ThreeMmdTextureLoader } from "./materials.js";
import { resolveMappedTexture, isAbsoluteUrl } from "./texture-source.js";
import type { TextureResolver, TextureMap } from "./texture-source.js";
import { loadMaterialTexture, loadResolvedTexture } from "./texture-loading.js";

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

const bundledSharedToonTextureUrls: TextureMap = {
  "toon01.bmp": new URL("./assets/mmd/toon01.bmp", import.meta.url),
  "toon02.bmp": new URL("./assets/mmd/toon02.bmp", import.meta.url),
  "toon03.bmp": new URL("./assets/mmd/toon03.bmp", import.meta.url),
  "toon04.bmp": new URL("./assets/mmd/toon04.bmp", import.meta.url),
  "toon05.bmp": new URL("./assets/mmd/toon05.bmp", import.meta.url),
  "toon06.bmp": new URL("./assets/mmd/toon06.bmp", import.meta.url),
  "toon07.bmp": new URL("./assets/mmd/toon07.bmp", import.meta.url),
  "toon08.bmp": new URL("./assets/mmd/toon08.bmp", import.meta.url),
  "toon09.bmp": new URL("./assets/mmd/toon09.bmp", import.meta.url),
  "toon10.bmp": new URL("./assets/mmd/toon10.bmp", import.meta.url)
};

let defaultToonGradientMap: THREE.DataTexture | undefined;

export async function loadToonTexture(
  material: Pick<
    MaterialInfo,
    "toonTexturePath" | "toonTextureInfo" | "sharedToonIndex"
  >,
  materialIndex: number,
  modelUrl: string | undefined,
  textureResolver: TextureResolver | undefined,
  textureDiagnostics: TextureLoadDiagnostic[],
  textureLoader?: ThreeMmdTextureLoader,
  textureCache?: Map<string, Promise<THREE.Texture | undefined>>,
  ddsLoader?: ThreeMmdTextureLoader
): Promise<THREE.Texture | undefined> {
  if (!material.toonTexturePath && material.sharedToonIndex === undefined) {
    return getDefaultToonGradientMap();
  }
  const toonTexture = resolveMmdToonTextureReference(material);
  if (!toonTexture.path) {
    return undefined;
  }
  const bundledSharedToonTexture = toonTexture.shared
    ? resolveBundledSharedToonTexture(toonTexture.path)
    : undefined;
  let unsupportedFormat = false;
  let texture: THREE.Texture | undefined;
  if (bundledSharedToonTexture) {
    texture = await loadResolvedTexture(
      bundledSharedToonTexture,
      toonTexture.path,
      undefined,
      textureLoader,
      textureCache,
      "toon",
      modelUrl
    );
  } else {
    const result = await loadMaterialTexture(
      toonTexture.path,
      toonTexture.textureInfo,
      modelUrl,
      textureResolver,
      textureLoader,
      textureCache,
      "toon",
      ddsLoader
    );
    texture = result.texture;
    unsupportedFormat = result.unsupportedFormat === true;
  }
  if (unsupportedFormat && material.toonTexturePath) {
    textureDiagnostics.push({
      level: "warning",
      code: "TEXTURE_FORMAT_UNSUPPORTED",
      materialIndex,
      textureKind: "toon",
      path: material.toonTexturePath
    });
  }
  if (!texture && material.toonTexturePath) {
    if (!unsupportedFormat) {
      textureDiagnostics.push({
        level: "warning",
        code: "TEXTURE_RESOLVE_FAILED",
        materialIndex,
        textureKind: "toon",
        path: material.toonTexturePath
      });
    }
  }
  if (
    !texture &&
    !material.toonTexturePath &&
    material.sharedToonIndex !== undefined &&
    toonTexture.shared &&
    !textureResolver &&
    !modelUrl
  ) {
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
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  texture.userData.mmdToonTexturePath = toonTexture.path;
  texture.userData.mmdToonTextureShared = toonTexture.shared;
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
  canvas.width = height;
  canvas.height = width;
  const context = canvas.getContext("2d");
  if (!context) {
    return texture;
  }
  context.clearRect(0, 0, height, width);
  context.translate(height / 2, width / 2);
  context.rotate(Math.PI / 2);
  context.translate(-width / 2, -height / 2);
  context.drawImage(texture.image as CanvasImageSource, 0, 0);
  texture.image = context.getImageData(0, 0, height, width);
  texture.userData.mmdToonTextureRotated = true;
  texture.needsUpdate = true;
  return texture;
}

export function createMmdBuiltInToonTextureMap(baseUrl: string | URL): TextureMap {
  const map: TextureMap = {};
  const base = typeof baseUrl === "string" ? baseUrl : baseUrl.toString();
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  for (let index = 1; index <= 10; index += 1) {
    const texturePath = `toon${String(index).padStart(2, "0")}.bmp`;
    map[texturePath] = isAbsoluteUrl(normalizedBase)
      ? new URL(texturePath, normalizedBase).toString()
      : `${normalizedBase}${texturePath}`;
  }

  return map;
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

export function getDefaultToonGradientMap(): THREE.DataTexture {
  if (defaultToonGradientMap) {
    return defaultToonGradientMap;
  }
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.name = "mmd-default-toon";
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.userData.mmdFallbackToonGradient = true;
  defaultToonGradientMap = texture;
  return defaultToonGradientMap;
}

function resolveBundledSharedToonTexture(texturePath: string): string | URL | Blob | undefined {
  return resolveMappedTexture(texturePath, bundledSharedToonTextureUrls);
}

let cachedToonGradient: THREE.DataTexture | undefined;

function toonGradient(): THREE.DataTexture {
  if (cachedToonGradient) {
    return cachedToonGradient;
  }
  // WebGPU does not support RGB8 texture uploads; opaque RGBA works on both backends.
  const data = new Uint8Array(16).fill(255);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.userData.mmdFallbackToonGradient = true;
  texture.needsUpdate = true;
  cachedToonGradient = texture;
  return texture;
}
