import * as THREE from "three";

import type { ThreeMmdModel } from "./index.js";

export interface DisposeMmdModelOptions {
  /**
   * Controls texture disposal. Defaults to "all" for backward compatibility.
   * Use "none" when textures are shared outside the model.
   */
  readonly textures?: "all" | "owned" | "none";
}

export function disposeMmdModel(
  model: ThreeMmdModel,
  options: DisposeMmdModelOptions = {}
): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();
  const textureOwnership = options.textures ?? "all";
  const root = model.root ?? model.object;
  root?.parent?.remove(root);
  const meshes = [
    model.mesh,
    ...(model.outlineMeshes ?? []),
    ...(model.renderOrderMeshes ?? [])
  ];
  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    disposeSkeletonResources(mesh.skeleton);
    if (mesh.geometry && !disposedGeometries.has(mesh.geometry)) {
      mesh.geometry.dispose();
      disposedGeometries.add(mesh.geometry);
    }
    for (const material of normalizeMaterials(mesh.material)) {
      disposeMaterialResources(material, disposedMaterials, disposedTextures, textureOwnership);
    }
    disposeMaterialResources(
      mesh.customDepthMaterial,
      disposedMaterials,
      disposedTextures,
      textureOwnership
    );
    disposeMaterialResources(
      mesh.customDistanceMaterial,
      disposedMaterials,
      disposedTextures,
      textureOwnership
    );
  }
}

function disposeMaterialResources(
  material: THREE.Material | undefined,
  disposedMaterials: Set<THREE.Material>,
  disposedTextures: Set<THREE.Texture>,
  textureOwnership: NonNullable<DisposeMmdModelOptions["textures"]>
): void {
  if (!material) {
    return;
  }
  for (const texture of collectMaterialTextures(material)) {
    disposeTexture(texture, disposedTextures, textureOwnership);
  }
  if (!disposedMaterials.has(material)) {
    material.dispose();
    disposedMaterials.add(material);
  }
}

function collectMaterialTextures(material: THREE.Material): THREE.Texture[] {
  const textures: THREE.Texture[] = [];
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      textures.push(value);
    }
  }
  for (const value of Object.values(material.userData ?? {})) {
    if (value instanceof THREE.Texture) {
      textures.push(value);
    }
  }
  for (const value of Object.values(material.userData ?? {})) {
    const uniforms = (value as { uniforms?: unknown } | undefined)?.uniforms;
    if (uniforms && typeof uniforms === "object") {
      for (const uniform of Object.values(uniforms)) {
        const texture = (uniform as { value?: unknown } | undefined)?.value;
        if (texture instanceof THREE.Texture) {
          textures.push(texture);
        }
      }
    }
  }
  return textures;
}

function disposeTexture(
  texture: THREE.Texture | null | undefined,
  disposedTextures: Set<THREE.Texture>,
  textureOwnership: NonNullable<DisposeMmdModelOptions["textures"]>
): void {
  if (
    !texture ||
    disposedTextures.has(texture) ||
    textureOwnership === "none" ||
    (textureOwnership === "owned" && texture.userData.mmdTextureOwnership !== "loader")
  ) {
    return;
  }
  texture.dispose();
  disposedTextures.add(texture);
}

function disposeSkeletonResources(skeleton: THREE.Skeleton | undefined): void {
  if (!skeleton) {
    return;
  }
  skeleton.dispose();
}

function normalizeMaterials(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}
