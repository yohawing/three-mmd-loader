import * as THREE from "three";

import type { ThreeMmdModel } from "./index.js";

export function disposeMmdModel(model: ThreeMmdModel): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();
  const disposedSkeletons = new Set<THREE.Skeleton>();
  const bodyMeshes = Array.isArray(model.mesh.userData.mmdMorphSplitBodyMeshes)
    ? model.mesh.userData.mmdMorphSplitBodyMeshes.filter(isSkinnedMesh)
    : [];
  const meshes = [
    model.mesh,
    ...bodyMeshes,
    ...(model.outlineMeshes ?? []),
    ...(model.renderOrderMeshes ?? [])
  ];
  model.object?.parent?.remove(model.object);
  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    disposeSkeletonResources(mesh.skeleton, disposedSkeletons);
    if (mesh.geometry && !disposedGeometries.has(mesh.geometry)) {
      mesh.geometry.dispose();
      disposedGeometries.add(mesh.geometry);
    }
    for (const material of normalizeMaterials(mesh.material)) {
      disposeMaterialResources(material, disposedMaterials, disposedTextures);
    }
  }
}

function isSkinnedMesh(value: unknown): value is THREE.SkinnedMesh {
  return (
    value instanceof THREE.SkinnedMesh ||
    (typeof value === "object" &&
      value !== null &&
      (value as { readonly isSkinnedMesh?: unknown }).isSkinnedMesh === true)
  );
}

function disposeMaterialResources(
  material: THREE.Material,
  disposedMaterials: Set<THREE.Material>,
  disposedTextures: Set<THREE.Texture>
): void {
  for (const texture of collectMaterialTextures(material)) {
    disposeTexture(texture, disposedTextures);
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
  disposedTextures: Set<THREE.Texture>
): void {
  if (!texture || disposedTextures.has(texture)) {
    return;
  }
  texture.dispose();
  disposedTextures.add(texture);
}

function disposeSkeletonResources(
  skeleton: THREE.Skeleton | undefined,
  disposedSkeletons: Set<THREE.Skeleton>
): void {
  if (!skeleton || disposedSkeletons.has(skeleton)) {
    return;
  }
  skeleton.dispose();
  disposedSkeletons.add(skeleton);
}

function normalizeMaterials(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}
