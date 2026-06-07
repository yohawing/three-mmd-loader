import * as THREE from "three";

import type { MaterialInfo, MorphData } from "../parser/model/modelTypes.js";
import {
  attachMmdMaterialMetadata,
  mmdMaterialAlphaTest,
  mmdMaterialDepthWrite,
  mmdMaterialSuppressesColorAtAlpha,
  mmdMaterialTransparencyMode
} from "./material/material-metadata.js";
import { attachMmdMaterialFactors, attachMmdSphereTexture } from "./material/material-shader-hooks.js";
import {
  evaluateMmdDefaultMaterialTransparency,
  loadMmdDefaultMaterialTextureSet
} from "./material/material-texture-set.js";
import type { MmdDefaultMaterialTransparencyDiagnostic } from "./material/material-texture-set.js";
import { createFallbackMmdMaterial, createTextureResolver } from "./textures.js";
import type { TextureMap, TextureResolver } from "./textures.js";

export interface TextureLoadDiagnostic {
  readonly level: "warning";
  readonly code:
    | "TEXTURE_FORMAT_UNSUPPORTED"
    | "TEXTURE_RESOLVE_FAILED"
    | "SPHERE_MAP_NOT_SUPPORTED";
  readonly materialIndex: number;
  readonly textureKind: "diffuse" | "sphere" | "toon";
  readonly path: string;
  readonly sphereMode?: MaterialInfo["sphereMode"];
}

export type MaterialTransparencyDiagnostic = MmdDefaultMaterialTransparencyDiagnostic;

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
  readonly ddsLoader?: ThreeMmdTextureLoader;
  readonly textureCache?: Map<string, Promise<THREE.Texture | undefined>>;
  readonly modelUrl?: string;
  readonly geometry?: THREE.BufferGeometry;
  readonly morphs?: readonly MorphData[];
  readonly geometryAwareAlpha?: boolean;
  readonly materialDiagnostics?: MaterialTransparencyDiagnostic[];
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
    const transparencyMode = mmdMaterialTransparencyMode(material, false);
    const transparent = transparencyMode === "alphaBlend";
    const threeMaterial = new THREE.MeshToonMaterial({
      color: new THREE.Color(material.diffuse[0], material.diffuse[1], material.diffuse[2]),
      emissive: new THREE.Color(0, 0, 0),
      opacity: material.diffuse[3],
      transparent,
      depthWrite: mmdMaterialDepthWrite(transparencyMode),
      colorWrite: !mmdMaterialSuppressesColorAtAlpha(material.diffuse[3], material.flags),
      alphaTest: mmdMaterialAlphaTest(material, false),
      side: material.flags.doubleSided ? THREE.DoubleSide : THREE.FrontSide
    });
    threeMaterial.name = material.englishName || material.name || `material_${materialIndex}`;
    threeMaterial.visible =
      material.diffuse[3] > 0 ||
      mmdMaterialSuppressesColorAtAlpha(material.diffuse[3], material.flags);
    attachMmdMaterialMetadata(threeMaterial, material, materialIndex, transparencyMode);
    return threeMaterial;
  });
}

export async function applyThreeMmdMaterialTextures(
  threeMaterials: readonly THREE.MeshToonMaterial[],
  mmdMaterials: readonly MaterialInfo[],
  options: ThreeMmdMaterialTextureOptions = {}
): Promise<TextureLoadDiagnostic[]> {
  const textureDiagnostics: TextureLoadDiagnostic[] = [];
  const materialDiagnostics = options.materialDiagnostics;
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
        textureDiagnostics,
        textureLoader,
        options.textureCache,
        options.ddsLoader
      );
      if (texture) {
        material.map = texture;
      }
      if (gradientMap) {
        material.gradientMap = gradientMap;
      }
      if (options.geometry) {
        const {
          transparencyMode,
          textureTransparencyMode,
          morphAlphaTransparent,
          diagnostic
        } =
          evaluateMmdDefaultMaterialTransparency(
            mmdMaterial,
            options.morphs ?? [],
            options.geometry,
            materialIndex,
            texture,
            { geometryAwareAlpha: options.geometryAwareAlpha }
          );
        material.transparent = transparencyMode === "alphaBlend";
        material.depthWrite = mmdMaterialDepthWrite(transparencyMode);
        material.colorWrite = !mmdMaterialSuppressesColorAtAlpha(
          mmdMaterial.diffuse[3],
          mmdMaterial.flags
        );
        material.alphaTest = transparencyMode === "alphaTest" ? 0.01 : 0;
        attachMmdMaterialMetadata(material, mmdMaterial, materialIndex, transparencyMode);
        material.userData.mmdMaterial.textureTransparencyMode = textureTransparencyMode;
        if (morphAlphaTransparent) {
          material.userData.mmdMaterial.morphAlphaTransparent = true;
        }
        if (materialDiagnostics) {
          materialDiagnostics[materialIndex] = diagnostic;
        }
      }
      if (sphereTexture) {
        material.userData.mmdSphereTexture = sphereTexture;
        attachMmdSphereTexture(material, mmdMaterial.sphereMode, sphereTexture);
      }

      attachMmdMaterialFactors(material);
      if (texture || gradientMap || sphereTexture) {
        material.needsUpdate = true;
      }
    })
  );

  return textureDiagnostics;
}
