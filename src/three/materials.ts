import * as THREE from "three";

import type { MaterialInfo } from "../parser/model/modelTypes.js";
import {
  createTextureResolver,
  resolveMmdToonTextureReference
} from "./textures.js";
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

      const diffuse = await loadResolvedTexture(
        materialIndex,
        "diffuse",
        mmdMaterial.texturePath,
        resolver,
        textureLoader,
        options.modelUrl,
        diagnostics
      );
      if (diffuse) {
        diffuse.colorSpace = THREE.SRGBColorSpace;
        material.map = diffuse;
      }

      const toonReference = resolveMmdToonTextureReference(mmdMaterial);
      const toon = await loadResolvedTexture(
        materialIndex,
        "toon",
        toonReference.path,
        resolver,
        textureLoader,
        options.modelUrl,
        diagnostics
      );
      if (toon) {
        toon.minFilter = THREE.NearestFilter;
        toon.magFilter = THREE.NearestFilter;
        material.gradientMap = toon;
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

      if (diffuse || toon) {
        material.needsUpdate = true;
      }
    })
  );

  return diagnostics;
}

function createFallbackMmdMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(0.8, 0.8, 0.8),
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

async function loadResolvedTexture(
  materialIndex: number,
  textureKind: TextureLoadDiagnostic["textureKind"],
  path: string,
  resolver: TextureResolver | undefined,
  textureLoader: ThreeMmdTextureLoader,
  modelUrl: string | undefined,
  diagnostics: TextureLoadDiagnostic[]
): Promise<THREE.Texture | undefined> {
  if (!path) {
    return undefined;
  }

  let resolved: string | URL | Blob | undefined;
  try {
    resolved = await resolver?.resolve(path, modelUrl);
  } catch {
    diagnostics.push(createTextureDiagnostic(materialIndex, textureKind, path));
    return undefined;
  }

  if (!resolved) {
    diagnostics.push(createTextureDiagnostic(materialIndex, textureKind, path));
    return undefined;
  }

  try {
    return await loadTexture(textureLoader, resolved);
  } catch {
    diagnostics.push(createTextureDiagnostic(materialIndex, textureKind, path));
    return undefined;
  }
}

function loadTexture(
  textureLoader: ThreeMmdTextureLoader,
  resolved: string | URL | Blob
): Promise<THREE.Texture> {
  const objectUrl = createObjectUrl(resolved);
  const url = objectUrl ?? (resolved instanceof URL ? resolved.toString() : resolved);
  if (typeof url !== "string") {
    return Promise.reject(new TypeError("TEXTURE_BLOB_OBJECT_URL_UNAVAILABLE"));
  }

  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        texture.flipY = false;
        resolve(texture);
      },
      undefined,
      (error) => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        reject(error);
      }
    );
  });
}

function createObjectUrl(resolved: string | URL | Blob): string | undefined {
  if (typeof Blob !== "undefined" && resolved instanceof Blob) {
    return typeof URL.createObjectURL === "function" ? URL.createObjectURL(resolved) : undefined;
  }
  return undefined;
}

function createTextureDiagnostic(
  materialIndex: number,
  textureKind: TextureLoadDiagnostic["textureKind"],
  path: string
): TextureLoadDiagnostic {
  return {
    level: "warning",
    code: "TEXTURE_RESOLVE_FAILED",
    materialIndex,
    textureKind,
    path
  };
}
