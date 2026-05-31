import * as THREE from "three";

import { attachMmdSdefSkinning } from "./material-sdef.js";

export function createMmdShadowDepthMaterial(
  sourceMaterial: THREE.Material | undefined
): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    alphaTest: sourceMaterialAlphaTest(sourceMaterial),
    side: sourceMaterial?.side ?? THREE.FrontSide
  });
  if (sourceMaterial && "map" in sourceMaterial && sourceMaterial.map instanceof THREE.Texture) {
    material.map = sourceMaterial.map;
  }
  attachMmdSdefSkinning(material);
  material.userData.mmdShadowDepthMaterial = {
    shaderApplied: true,
    sourceMaterialUuid: sourceMaterial?.uuid
  };
  return material;
}

function sourceMaterialAlphaTest(sourceMaterial: THREE.Material | undefined): number {
  if (
    sourceMaterial &&
    "alphaTest" in sourceMaterial &&
    typeof sourceMaterial.alphaTest === "number"
  ) {
    return sourceMaterial.alphaTest;
  }
  return 0;
}
