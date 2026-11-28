import type { Material, SkinnedMesh } from "three";
import type { MaterialInfo, MorphData } from "../../parser/model/modelTypes.js";
import { clampColor } from "../utils.js";
import { mmdMaterialSuppressesColorAtAlpha, mmdTransparencyModeAlphaTest } from "./material-metadata.js";

type AlphaOffset = { morphIndex: number; multiply: boolean; diffuse: number; edge: number };
type MaterialSlot = {
  info: MaterialInfo;
  terms: AlphaOffset[];
  draws: Set<Material>;
  outlines: { material: Material; opacity: number; visible: boolean }[];
};

/** Bind only alpha-changing offsets. The runtime has already expanded group
 * morphs when tick returns, including for a model with split body geometry. */
export function createMaterialMorphAlphaSync(
  mesh: SkinnedMesh, infos: readonly MaterialInfo[], morphs: readonly MorphData[],
  proxies: readonly SkinnedMesh[], outlines: readonly SkinnedMesh[]
): (() => void) | undefined {
  const originalMaterials = mesh.material;
  const materials = Array.isArray(originalMaterials) ? originalMaterials : [originalMaterials];
  const slots = new Map<number, MaterialSlot>();
  for (const [morphIndex, morph] of morphs.entries()) {
    for (const offset of morph.materialOffsets) {
      const multiply = offset.operation === "multiply";
      const neutral = multiply ? 1 : 0;
      const diffuse = offset.diffuse[3], edge = offset.edgeColor[3];
      if (diffuse === neutral && edge === neutral) continue;
      const all = offset.materialIndex === -1;
      const term = { morphIndex, multiply, diffuse, edge };
      const end = all ? infos.length : offset.materialIndex + 1;
      for (let i = all ? 0 : offset.materialIndex; i < end; i++) {
        if (!infos[i] || !materials[i]) continue;
        let slot = slots.get(i);
        if (!slot) {
          slot = { info: infos[i], terms: [], draws: new Set([materials[i]]), outlines: [] };
          slots.set(i, slot);
        }
        slot.terms.push(term);
      }
    }
  }
  if (slots.size === 0) return;
  for (const proxy of proxies) {
    if (!Array.isArray(proxy.material)) {
      slots.get(proxy.userData.mmdMaterialRenderProxy.materialIndex)?.draws.add(proxy.material);
    }
  }
  for (const outline of outlines) {
    const material = outline.material;
    if (!Array.isArray(material)) {
      slots.get(outline.userData.mmdOutlineProxy.sourceMaterialIndex)?.outlines.push({
        material, opacity: material.opacity, visible: material.visible
      });
    }
  }
  const updates = Array.from(slots.values(), ({ info, terms, draws, outlines: edges }) => {
    const baseDiffuse = info.diffuse[3], baseEdge = info.edgeColor[3];
    let previousDiffuse = baseDiffuse, previousEdge = baseEdge;
    return (weights: readonly number[]) => {
      let diffuseMul = 1, edgeMul = 1, diffuseAdd = 0, edgeAdd = 0;
      for (const term of terms) {
        const w = weights[term.morphIndex] ?? 0;
        if (term.multiply) {
          diffuseMul *= 1 + w * (term.diffuse - 1);
          edgeMul *= 1 + w * (term.edge - 1);
        } else {
          diffuseAdd += w * term.diffuse;
          edgeAdd += w * term.edge;
        }
      }
      const diffuse = clampColor(baseDiffuse * diffuseMul + diffuseAdd);
      const edge = clampColor(baseEdge * edgeMul + edgeAdd);
      if (diffuse === previousDiffuse && edge === previousEdge) return;
      const suppress = mmdMaterialSuppressesColorAtAlpha(diffuse, info.flags);
      for (const material of draws) {
        if (diffuse !== previousDiffuse) setDiffuseAlpha(material, diffuse, suppress);
        material.userData.mmdReferenceEdgeAlpha = edge;
      }
      const atRest = diffuse === baseDiffuse && edge === baseEdge;
      for (const draw of edges) {
        draw.material.opacity = atRest ? draw.opacity : edge;
        draw.material.visible = atRest ? draw.visible : !suppress && edge > 0;
      }
      previousDiffuse = diffuse;
      previousEdge = edge;
    };
  });
  return () => {
    const weights = mesh.morphTargetInfluences;
    // Replacement pipelines own their own materials and outline groups.
    if (weights && mesh.material === originalMaterials) for (const update of updates) update(weights);
  };
}

function setDiffuseAlpha(material: Material, opacity: number, suppress: boolean): void {
  const mode = material.userData.mmdMaterial.transparencyMode;
  const blend = mode === "alphaBlend" || opacity < 1;
  if (material.transparent !== blend) material.needsUpdate = true;
  material.opacity = opacity;
  material.transparent = blend;
  material.visible = opacity > 0 || suppress;
  material.colorWrite = !suppress && !material.userData.mmdShadowOnlyRenderProxy;
  material.alphaTest = suppress ? 0 : mmdTransparencyModeAlphaTest(mode === "opaque" && blend ? "alphaBlend" : mode);
}
