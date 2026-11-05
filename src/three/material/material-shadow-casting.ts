import type { Material } from "three";

/** MMD DrawModelMaterials shadow pass gates, using evaluated morph values. */
export function castsMmdReferenceShadow(material: Material): boolean {
  if (!material.visible) return false;
  const metadata = material.userData.mmdMaterial;
  if (!metadata) return material.visible;
  const edge = material.userData.mmdMaterialState?.edgeColor ?? metadata.edgeColor;
  const edgeAlpha = material.userData.mmdReferenceEdgeAlpha ?? edge?.[3];
  return metadata.flags?.selfShadowMap === true && edgeAlpha > 0 &&
    Math.fround(material.opacity) !== Math.fround(0.98);
}
