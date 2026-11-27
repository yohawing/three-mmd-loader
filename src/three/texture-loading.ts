import * as THREE from "three";
import type { MaterialInfo } from "../parser/model/modelTypes.js";
import type { TextureLoadDiagnostic, ThreeMmdTextureLoader } from "./materials.js";
import { evaluateMmdTextureAlphaRgba } from "./texture-alpha.js";
import { createTextureLoadRequest } from "./texture-bmp.js";
import { decodeMmdTgaTexture } from "./texture-tga.js";
import {
  isMmdTgaLikeTexturePath,
  isMmdDdsTexturePath,
  normalizeMmdTexturePath,
  resolveAdjacentTexture
} from "./texture-source.js";
import type { TextureResolver } from "./texture-source.js";

const blobTextureCacheKeys = new WeakMap<Blob, number>();
const blobTgaTextureCache = new WeakMap<Blob, Promise<THREE.DataTexture | undefined>>();
let nextBlobTextureCacheKey = 1;

export async function loadMaterialTextureWithDiagnostics(
  texturePath: string,
  textureInfo: MaterialInfo["textureInfo"],
  textureKind: TextureLoadDiagnostic["textureKind"],
  materialIndex: number,
  modelUrl: string | undefined,
  textureResolver: TextureResolver | undefined,
  textureDiagnostics: TextureLoadDiagnostic[],
  textureLoader?: ThreeMmdTextureLoader,
  textureCache?: Map<string, Promise<THREE.Texture | undefined>>,
  ddsLoader?: ThreeMmdTextureLoader
): Promise<THREE.Texture | undefined> {
  const result = await loadMaterialTexture(
    texturePath,
    textureInfo,
    modelUrl,
    textureResolver,
    textureLoader,
    textureCache,
    textureKind,
    ddsLoader
  );
  const texture = result.texture;
  if (result.unsupportedFormat && texturePath) {
    textureDiagnostics.push({
      level: "warning",
      code: "TEXTURE_FORMAT_UNSUPPORTED",
      materialIndex,
      textureKind,
      path: texturePath
    });
    return undefined;
  }
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
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
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

export async function loadMaterialTexture(
  texturePath: string,
  textureInfo: MaterialInfo["textureInfo"],
  modelUrl: string | undefined,
  textureResolver: TextureResolver | undefined,
  textureLoader?: ThreeMmdTextureLoader,
  textureCache?: Map<string, Promise<THREE.Texture | undefined>>,
  cacheNamespace = "material",
  ddsLoader?: ThreeMmdTextureLoader
): Promise<{ texture?: THREE.Texture; unsupportedFormat?: boolean }> {
  if (!texturePath) {
    return {};
  }
  const resolved = textureResolver
    ? await textureResolver.resolve(texturePath, modelUrl)
    : resolveAdjacentTexture(texturePath, modelUrl);
  if (!resolved) {
    return {};
  }
  const resolvedIsDds = isResolvedMmdDdsTexture(texturePath, resolved);
  if (resolvedIsDds && !ddsLoader) {
    return { unsupportedFormat: true };
  }
  if (isMmdTgaLikeTexturePath(texturePath)) {
    const tgaTexture = await loadMmdTgaTexture(resolved, textureInfo);
    if (tgaTexture) {
      return { texture: tgaTexture };
    }
  }
  const texture = await loadResolvedTexture(
    resolved,
    texturePath,
    textureInfo,
    resolvedIsDds ? ddsLoader : textureLoader,
    textureCache,
    cacheNamespace,
    modelUrl
  );
  return { texture };
}

function isResolvedMmdDdsTexture(texturePath: string, resolved: string | URL | Blob): boolean {
  if (typeof resolved === "string") {
    return isResolvedPathDds(texturePath, resolved);
  }
  if (typeof Blob !== "undefined" && resolved instanceof Blob) {
    const fileName =
      typeof File !== "undefined" && resolved instanceof File ? resolved.name : undefined;
    if (fileName) {
      return isMmdDdsTexturePath(fileName);
    }
    if (resolved.type) {
      return /dds/i.test(resolved.type);
    }
    return isMmdDdsTexturePath(texturePath);
  }
  if (resolved instanceof URL) {
    return isResolvedPathDds(texturePath, resolved.pathname);
  }
  return false;
}

function isResolvedPathDds(texturePath: string, resolvedPath: string): boolean {
  if (isMmdDdsTexturePath(resolvedPath)) {
    return true;
  }
  if (/\.(?:bmp|gif|jpe?g|png|tga|webp)(?:[?#].*)?$/i.test(resolvedPath)) {
    return false;
  }
  return isMmdDdsTexturePath(texturePath);
}

export async function loadResolvedTexture(
  resolved: string | URL | Blob,
  texturePath: string,
  textureInfo: MaterialInfo["textureInfo"],
  textureLoader?: ThreeMmdTextureLoader,
  textureCache?: Map<string, Promise<THREE.Texture | undefined>>,
  cacheNamespace = "material",
  modelUrl?: string
): Promise<THREE.Texture | undefined> {
  const cacheKey = createTextureCacheKey(
    cacheNamespace,
    texturePath,
    textureInfo,
    resolved,
    modelUrl
  );
  const cached = textureCache?.get(cacheKey);
  if (cached) {
    return cached;
  }
  const promise: Promise<THREE.Texture | undefined> = loadResolvedTextureUncached(
    resolved,
    texturePath,
    textureInfo,
    textureLoader
  ).then(
    (texture) => {
      if (!texture && textureCache?.get(cacheKey) === promise) {
        textureCache.delete(cacheKey);
      }
      return texture;
    },
    (error: unknown) => {
      if (textureCache?.get(cacheKey) === promise) {
        textureCache.delete(cacheKey);
      }
      throw error;
    }
  );
  textureCache?.set(cacheKey, promise);
  return promise;
}

async function loadResolvedTextureUncached(
  resolved: string | URL | Blob,
  texturePath: string,
  textureInfo: MaterialInfo["textureInfo"],
  textureLoader?: ThreeMmdTextureLoader
): Promise<THREE.Texture | undefined> {
  const request = await createTextureLoadRequest(resolved, texturePath);
  const loader = textureLoader ?? new THREE.TextureLoader();
  return new Promise((resolve) => {
    const finish = (texture: THREE.Texture | undefined) => {
      if (request.revokeUrl) {
        URL.revokeObjectURL(request.url);
      }
      resolve(texture);
    };
    try {
      loader.load(
        request.url,
        (texture) => {
          configureMmdTexture(texture, textureInfo);
          if (!textureLoader) {
            texture.userData.mmdTextureOwnership = "loader";
          }
          if (request.alphaMode) {
            texture.userData.mmdTextureAlphaMode = request.alphaMode;
          }
          finish(texture);
        },
        undefined,
        () => finish(undefined)
      );
    } catch {
      finish(undefined);
    }
  });
}

async function loadMmdTgaTexture(
  resolved: string | URL | Blob,
  textureInfo: MaterialInfo["textureInfo"]
): Promise<THREE.Texture | undefined> {
  const source =
    typeof Blob !== "undefined" && resolved instanceof Blob
      ? await loadCachedBlobMmdTgaTexture(resolved)
      : await loadMmdTgaTextureSource(resolved);
  if (!source) {
    return undefined;
  }
  return cloneMmdTgaTexture(source, textureInfo);
}

async function loadCachedBlobMmdTgaTexture(
  resolved: Blob
): Promise<THREE.DataTexture | undefined> {
  const cached = blobTgaTextureCache.get(resolved);
  if (cached) {
    return cached;
  }
  const promise = loadMmdTgaTextureSource(resolved).then(
    (texture) => {
      if (!texture && blobTgaTextureCache.get(resolved) === promise) {
        blobTgaTextureCache.delete(resolved);
      }
      return texture;
    },
    (error: unknown) => {
      if (blobTgaTextureCache.get(resolved) === promise) {
        blobTgaTextureCache.delete(resolved);
      }
      throw error;
    }
  );
  blobTgaTextureCache.set(resolved, promise);
  return promise;
}

async function loadMmdTgaTextureSource(
  resolved: string | URL | Blob
): Promise<THREE.DataTexture | undefined> {
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
    texture.userData.mmdTextureAlphaSource = "tga";
    texture.userData.mmdTextureOwnership = "loader";
    texture.userData.mmdTextureAlphaMode = image.hasAlpha
      ? evaluateMmdTextureAlphaRgba(image.data)
      : "opaque";
    return texture;
  } catch {
    return undefined;
  }
}

function cloneMmdTgaTexture(
  source: THREE.DataTexture,
  textureInfo: MaterialInfo["textureInfo"]
): THREE.DataTexture {
  const texture = source.clone();
  texture.needsUpdate = true;
  return configureMmdTexture(texture, textureInfo) as THREE.DataTexture;
}

function createTextureCacheKey(
  namespace: string,
  texturePath: string,
  textureInfo: MaterialInfo["textureInfo"],
  resolved: string | URL | Blob,
  modelUrl: string | undefined
): string {
  const normalizedPath = normalizeMmdTexturePath(texturePath).toLowerCase();
  const resolvedKey =
    typeof Blob !== "undefined" && resolved instanceof Blob
      ? `blob:${getBlobTextureCacheKey(resolved)}`
      : String(resolved);
  return [
    namespace,
    modelUrl ?? "",
    normalizedPath,
    resolvedKey,
    textureInfo?.invertY ? "invertY" : "",
    textureInfo?.noMipmap ? "noMipmap" : ""
  ].join("\0");
}

function getBlobTextureCacheKey(blob: Blob): number {
  let key = blobTextureCacheKeys.get(blob);
  if (key === undefined) {
    key = nextBlobTextureCacheKey;
    nextBlobTextureCacheKey += 1;
    blobTextureCacheKeys.set(blob, key);
  }
  return key;
}
