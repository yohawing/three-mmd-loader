import type { MaterialInfo, MorphData } from "../../parser/model/modelTypes.js";
import type * as THREE from "three";

import type { TextureLoadDiagnostic, ThreeMmdTextureLoader } from "../materials.js";
import type { MmdMaterialTransparencyMode, TextureResolver } from "../textures.js";
import * as textureAlpha from "../textures.js";
import {
  mmdMaterialMorphCanAffectAlpha,
  mmdMaterialTransparencyMode
} from "./material-metadata.js";

export interface MmdDefaultMaterialTextureSet {
  readonly texture: THREE.Texture | undefined;
  readonly gradientMap: THREE.Texture | undefined;
  readonly sphereTexture: THREE.Texture | undefined;
}

export interface MmdDefaultMaterialTransparencyOptions {
  readonly geometryAwareAlpha?: boolean;
}

const geometryAlphaCache = new WeakMap<
  THREE.Texture,
  WeakMap<THREE.BufferGeometry, Map<number, MmdMaterialTransparencyMode | undefined>>
>();

export async function loadMmdDefaultMaterialTextureSet(
  material: MaterialInfo,
  materialIndex: number,
  modelUrl: string | undefined,
  textureResolver: TextureResolver | undefined,
  textureDiagnostics: TextureLoadDiagnostic[],
  textureLoader?: ThreeMmdTextureLoader,
  textureCache?: Map<string, Promise<THREE.Texture | undefined>>,
  ddsLoader?: ThreeMmdTextureLoader
): Promise<MmdDefaultMaterialTextureSet> {
  const shouldLoadSphereTexture = material.sphereMode !== "none";
  const [texture, gradientMap, sphereTexture] = await Promise.all([
    textureAlpha.loadMaterialTextureWithDiagnostics(
      material.texturePath,
      material.textureInfo,
      "diffuse",
      materialIndex,
      modelUrl,
      textureResolver,
      textureDiagnostics,
      textureLoader,
      textureCache,
      ddsLoader
    ),
    textureAlpha.loadToonTexture(
      material,
      materialIndex,
      modelUrl,
      textureResolver,
      textureDiagnostics,
      textureLoader,
      textureCache,
      ddsLoader
    ),
    shouldLoadSphereTexture
      ? textureAlpha.loadMaterialTextureWithDiagnostics(
          material.sphereTexturePath,
          material.sphereTextureInfo,
          "sphere",
          materialIndex,
          modelUrl,
          textureResolver,
          textureDiagnostics,
          textureLoader,
          textureCache,
          ddsLoader
        )
      : undefined
  ]);
  return { texture, gradientMap, sphereTexture };
}

export function evaluateMmdDefaultMaterialTransparency(
  material: MaterialInfo,
  morphs: readonly MorphData[],
  geometry: THREE.BufferGeometry,
  materialIndex: number,
  texture: THREE.Texture | undefined,
  options: MmdDefaultMaterialTransparencyOptions = {}
): {
  readonly transparencyMode: MmdMaterialTransparencyMode;
  readonly textureTransparencyMode: MmdMaterialTransparencyMode | undefined;
  readonly morphAlphaTransparent: boolean;
} {
  const morphAlphaTransparent = mmdMaterialMorphCanAffectAlpha(morphs, materialIndex);
  const textureMetadataTransparencyMode = texture?.userData.mmdTextureAlphaMode as
    | MmdMaterialTransparencyMode
    | undefined;
  const textureAlphaSource = texture?.userData.mmdTextureAlphaSource as string | undefined;
  const pmxTransparencyMode = mmdMaterialTransparencyMode(material, !!texture);
  const pmxOpaque = pmxTransparencyMode === "opaque";
  const canUseTextureAlphaForOpaqueMaterial =
    textureAlphaSource !== "tga" || isLikelyMmdAlphaOverlayMaterial(material);
  const shouldUseTextureMetadata =
    textureMetadataTransparencyMode !== undefined &&
    (!pmxOpaque || textureAlphaSource !== "tga");
  const needsTextureTransparencyScan =
    !shouldUseTextureMetadata &&
    (options.geometryAwareAlpha
      ? pmxOpaque && canUseTextureAlphaForOpaqueMaterial
      : pmxTransparencyMode !== "opaque");
  const rawTextureTransparencyMode =
    (shouldUseTextureMetadata ? textureMetadataTransparencyMode : undefined) ??
    (texture && needsTextureTransparencyScan
      ? (options.geometryAwareAlpha
        ? evaluateCachedMmdTextureAlphaGeometry(texture, geometry, materialIndex)
        : textureAlpha.evaluateMmdTextureAlphaTexture(texture))
      : undefined);
  const textureTransparencyMode =
    rawTextureTransparencyMode === "alphaTest" && isLikelyMmdSoftAlphaOverlayMaterial(material)
      ? "alphaBlend"
      : rawTextureTransparencyMode;
  const baseTransparencyMode = mmdMaterialTransparencyMode(
    material,
    !!texture,
    textureTransparencyMode
  );
  const transparencyMode =
    baseTransparencyMode !== "opaque"
      ? baseTransparencyMode
      : textureTransparencyMode &&
          textureTransparencyMode !== "opaque" &&
          (options.geometryAwareAlpha || textureMetadataTransparencyMode !== undefined)
        ? textureTransparencyMode
        : "opaque";
  return {
    transparencyMode,
    textureTransparencyMode,
    morphAlphaTransparent
  };
}

function isLikelyMmdAlphaOverlayMaterial(material: MaterialInfo): boolean {
  const materialName = `${material.name} ${material.englishName}`.toLowerCase();
  if (/(hair\s*shadow|hairshadow|shadow|shade|髪影|髪の影|影)/u.test(materialName)) {
    return true;
  }
  return (
    !material.flags.groundShadow &&
    !material.flags.selfShadowMap &&
    !material.flags.selfShadow &&
    !material.flags.edge
  );
}

function isLikelyMmdSoftAlphaOverlayMaterial(material: MaterialInfo): boolean {
  const materialName = `${material.name} ${material.englishName}`.toLowerCase();
  return /(hair\s*shadow|hairshadow|shadow|shade|cheek|blush|髪影|髪の影|影|頬|ほほ|チーク)/u.test(
    materialName
  );
}

function evaluateCachedMmdTextureAlphaGeometry(
  texture: THREE.Texture,
  geometry: THREE.BufferGeometry,
  materialIndex: number
): MmdMaterialTransparencyMode | undefined {
  let geometryCache = geometryAlphaCache.get(texture);
  if (!geometryCache) {
    geometryCache = new WeakMap();
    geometryAlphaCache.set(texture, geometryCache);
  }
  let materialCache = geometryCache.get(geometry);
  if (!materialCache) {
    materialCache = new Map();
    geometryCache.set(geometry, materialCache);
  }
  if (materialCache.has(materialIndex)) {
    return materialCache.get(materialIndex);
  }
  const alphaMode = textureAlpha.evaluateMmdTextureAlphaGeometry(texture, geometry, materialIndex);
  materialCache.set(materialIndex, alphaMode);
  return alphaMode;
}
