import * as THREE from "three";

export function disposeModelResources(model) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  const disposedTextures = new Set();
  const meshes = [
    model.mesh,
    ...(model.outlineMeshes ?? []),
    ...(model.renderOrderMeshes ?? [])
  ];
  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    disposeSkeletonResources(mesh.skeleton, disposedTextures);
    if (mesh.geometry && !disposedGeometries.has(mesh.geometry)) {
      mesh.geometry.dispose();
      disposedGeometries.add(mesh.geometry);
    }
    for (const material of normalizeMaterials(mesh.material)) {
      disposeMaterialResources(material, disposedMaterials, disposedTextures);
    }
  }
}

export function disposeMaterialResources(material, disposedMaterials, disposedTextures) {
  for (const texture of collectMaterialTextures(material)) {
    disposeTexture(texture, disposedTextures);
  }
  if (!disposedMaterials.has(material)) {
    material.dispose();
    disposedMaterials.add(material);
  }
}

export function collectMaterialTextures(material) {
  const textures = [];
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
    const uniforms = value?.uniforms;
    if (uniforms && typeof uniforms === "object") {
      for (const uniform of Object.values(uniforms)) {
        if (uniform?.value instanceof THREE.Texture) {
          textures.push(uniform.value);
        }
      }
    }
  }
  return textures;
}

export function disposeTexture(texture, disposedTextures) {
  if (!texture || disposedTextures.has(texture)) {
    return;
  }
  texture.dispose();
  disposedTextures.add(texture);
}

export function disposeSkeletonResources(skeleton, disposedTextures) {
  if (!skeleton) {
    return;
  }
  disposeTexture(skeleton.boneTexture, disposedTextures);
  skeleton.dispose?.();
}

export function normalizeMaterials(material) {
  return Array.isArray(material) ? material : [material];
}
