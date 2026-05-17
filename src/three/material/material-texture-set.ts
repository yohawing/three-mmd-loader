import type { MaterialInfo } from "../../parser/model/modelTypes.js";
import type * as THREE from "three";

import type { TextureLoadDiagnostic, ThreeMmdTextureLoader } from "../materials.js";
import type { TextureResolver } from "../textures.js";
import { loadMaterialTextureWithDiagnostics, loadToonTexture } from "../textures.js";

export interface MmdDefaultMaterialTextureSet {
  readonly texture: THREE.Texture | undefined;
  readonly gradientMap: THREE.Texture | undefined;
  readonly sphereTexture: THREE.Texture | undefined;
}

export async function loadMmdDefaultMaterialTextureSet(
  material: MaterialInfo,
  materialIndex: number,
  modelUrl: string | undefined,
  textureResolver: TextureResolver | undefined,
  textureDiagnostics: TextureLoadDiagnostic[],
  textureLoader?: ThreeMmdTextureLoader
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
      textureLoader
    ),
    loadToonTexture(
      material,
      materialIndex,
      modelUrl,
      textureResolver,
      textureDiagnostics,
      textureLoader
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
          textureLoader
        )
      : undefined
  ]);
  return { texture, gradientMap, sphereTexture };
}
