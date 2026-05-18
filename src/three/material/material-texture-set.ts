import type { MaterialInfo, MorphData } from "../../parser/model/modelTypes.js";
import type * as THREE from "three";

import type { TextureLoadDiagnostic, ThreeMmdTextureLoader } from "../materials.js";
import type { MmdMaterialTransparencyMode, TextureResolver } from "../textures.js";
import {
  evaluateMmdTextureAlphaGeometry,
  evaluateMmdTextureAlphaTexture,
  loadMaterialTextureWithDiagnostics,
  loadToonTexture
} from "../textures.js";
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
  textureCache?: Map<string, Promise<THREE.Texture | undefined>>
): Promise<MmdDefaultMaterialTextureSet> {
  const shouldLoadSphereTexture = material.sphereMode !== "none";
  const [texture, gradientMap, sphereTexture] = await Promise.all([
    loadMaterialTextureWithDiagnostics(
      material.texturePath,
      material.textureInfo,
      "diffuse",
      materialIndex,
      modelUrl,
      textureResolver,
      textureDiagnostics,
      textureLoader,
      textureCache
    ),
    loadToonTexture(
      material,
      materialIndex,
      modelUrl,
      textureResolver,
      textureDiagnostics,
      textureLoader,
      textureCache
    ),
    shouldLoadSphereTexture
      ? loadMaterialTextureWithDiagnostics(
          material.sphereTexturePath,
          material.sphereTextureInfo,
          "sphere",
          materialIndex,
          modelUrl,
          textureResolver,
          textureDiagnostics,
          textureLoader,
          textureCache
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
  const textureTransparencyMode = texture
    ? (options.geometryAwareAlpha
      ? (evaluateMmdTextureAlphaGeometry(texture, geometry, materialIndex) ??
        evaluateMmdTextureAlphaTexture(texture))
      : evaluateMmdTextureAlphaTexture(texture))
    : undefined;
  const baseTransparencyMode = mmdMaterialTransparencyMode(
    material,
    !!texture,
    textureTransparencyMode
  );
  const morphAlphaTransparent = mmdMaterialMorphCanAffectAlpha(morphs, materialIndex);
  return {
    transparencyMode: morphAlphaTransparent ? "alphaBlend" : baseTransparencyMode,
    textureTransparencyMode,
    morphAlphaTransparent
  };
}
