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
      textureCache
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
  const needsTextureTransparencyScan =
    textureMetadataTransparencyMode === undefined &&
    (!!options.geometryAwareAlpha ||
      material.diffuse[3] < 1 ||
      (material.flags as { alphaTest?: boolean }).alphaTest === true ||
      morphAlphaTransparent);
  const textureTransparencyMode =
    textureMetadataTransparencyMode ??
    (texture && needsTextureTransparencyScan
      ? (options.geometryAwareAlpha
        ? (textureAlpha.evaluateMmdTextureAlphaGeometry(texture, geometry, materialIndex) ??
          textureAlpha.evaluateMmdTextureAlphaTexture(texture))
        : textureAlpha.evaluateMmdTextureAlphaTexture(texture))
      : undefined);
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
    transparencyMode: morphAlphaTransparent ? "alphaBlend" : transparencyMode,
    textureTransparencyMode,
    morphAlphaTransparent
  };
}
