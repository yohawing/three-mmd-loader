import * as THREE from "three";

import type { MaterialInfo } from "../parser/model/modelTypes.js";
import { attachMmdSphereTexture } from "./material/material-shader-hooks.js";
import { loadMmdDefaultMaterialTextureSet } from "./material/material-texture-set.js";
import { createFallbackMmdMaterial, createTextureResolver } from "./textures.js";
import type { TextureMap, TextureResolver } from "./textures.js";

export interface TextureLoadDiagnostic {
  readonly level: "warning";
  readonly code: "TEXTURE_RESOLVE_FAILED" | "SPHERE_MAP_NOT_SUPPORTED";
  readonly materialIndex: number;
  readonly textureKind: "diffuse" | "sphere" | "toon";
  readonly path: string;
  readonly sphereMode?: MaterialInfo["sphereMode"];
}

export interface ThreeMmdTextureLoader {
  load(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): THREE.Texture;
}

export interface ThreeMmdMaterialTextureOptions {
  readonly textureResolver?: TextureResolver;
  readonly textureMap?: TextureMap;
  readonly textureLoader?: ThreeMmdTextureLoader;
  readonly modelUrl?: string;
}

export type ThreeMmdSphereMappedToonMaterial = THREE.MeshToonMaterial & {
  envMap?: THREE.Texture | null;
  combine?: THREE.Combine;
};

export function createThreeMmdMaterials(
  materials: readonly MaterialInfo[]
): THREE.MeshToonMaterial[] {
  if (materials.length === 0) {
    return [createFallbackMmdMaterial()];
  }

  return materials.map((material, materialIndex) => {
    const transparent = material.diffuse[3] < 1;
    const threeMaterial = new THREE.MeshToonMaterial({
      color: new THREE.Color(material.diffuse[0], material.diffuse[1], material.diffuse[2]),
      opacity: material.diffuse[3],
      transparent,
      depthWrite: !transparent,
      side: material.flags.doubleSided ? THREE.DoubleSide : THREE.FrontSide
    });
    threeMaterial.name = material.englishName || material.name || `material_${materialIndex}`;
    threeMaterial.visible = material.diffuse[3] > 0;
    threeMaterial.userData.mmdMaterial = {
      materialIndex,
      name: material.name,
      englishName: material.englishName,
      diffuse: [...material.diffuse],
      specular: [...material.specular],
      specularPower: material.specularPower,
      ambient: [...material.ambient],
      edgeColor: [...material.edgeColor],
      edgeSize: material.edgeSize,
      flags: { ...material.flags },
      texturePath: material.texturePath,
      sphereTexturePath: material.sphereTexturePath,
      sphereMode: material.sphereMode,
      toonTexturePath: material.toonTexturePath,
      sharedToonIndex: material.sharedToonIndex
    };
    return threeMaterial;
  });
}

export async function applyThreeMmdMaterialTextures(
  threeMaterials: readonly THREE.MeshToonMaterial[],
  mmdMaterials: readonly MaterialInfo[],
  options: ThreeMmdMaterialTextureOptions = {}
): Promise<TextureLoadDiagnostic[]> {
  const diagnostics: TextureLoadDiagnostic[] = [];
  const resolver = createTextureResolver(
    options.textureResolver,
    options.textureMap ?? (options.modelUrl ? {} : undefined)
  );
  const textureLoader = options.textureLoader ?? new THREE.TextureLoader();

  await Promise.all(
    mmdMaterials.map(async (mmdMaterial, materialIndex) => {
      const material = threeMaterials[materialIndex];
      if (!material) {
        return;
      }

      const { texture, gradientMap, sphereTexture } = await loadMmdDefaultMaterialTextureSet(
        mmdMaterial,
        materialIndex,
        options.modelUrl,
        resolver,
        diagnostics,
        textureLoader
      );
      if (texture) {
        material.map = texture;
      }
      if (gradientMap) {
        material.gradientMap = gradientMap;
      }
      if (sphereTexture) {
        material.userData.mmdSphereTexture = sphereTexture;
        attachMmdSphereTexture(material, mmdMaterial.sphereMode, sphereTexture);
      }

      if (mmdMaterial.sphereTexturePath) {
        diagnostics.push({
          level: "warning",
          code: "SPHERE_MAP_NOT_SUPPORTED",
          materialIndex,
          textureKind: "sphere",
          path: mmdMaterial.sphereTexturePath,
          sphereMode: mmdMaterial.sphereMode
        });
      }

      if (texture || gradientMap || sphereTexture) {
        material.needsUpdate = true;
      }
    })
  );

  return diagnostics;
}
