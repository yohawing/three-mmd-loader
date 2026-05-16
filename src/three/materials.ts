import * as THREE from "three";

import type { MaterialInfo } from "../parser/model/modelTypes.js";

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
