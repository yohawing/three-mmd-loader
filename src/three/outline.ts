import type { MaterialInfo, MaterialRuntimeState } from "../parser/model/modelTypes.js";
import * as THREE from "three";

import {
  mmdMaterialSuppressesColorAtAlpha
} from "./material/material-metadata.js";
import { clampColor } from "./utils.js";

const MMD_OUTLINE_MODEL_SPACE_SCALE = 30;

export interface MmdOutlineOptions {
  readonly scale?: number;
  readonly alphaTest?: number;
  readonly fallbackColor?: THREE.ColorRepresentation;
  readonly forceFallback?: boolean;
}

export interface MmdOutlineModelSource {
  readonly mesh: THREE.SkinnedMesh;
  readonly materials: readonly MaterialInfo[];
}

export function createMmdOutlineMesh(
  model: MmdOutlineModelSource,
  options: MmdOutlineOptions = {}
): THREE.SkinnedMesh | undefined {
  const materialInfos = model.materials;
  if (
    !options.forceFallback &&
    !materialInfos.some((material) => material.flags.edge && material.edgeSize > 0)
  ) {
    return undefined;
  }

  const sourceMaterials = Array.isArray(model.mesh.material)
    ? model.mesh.material
    : [model.mesh.material];
  const hasVertexEdgeScale = !!model.mesh.geometry.getAttribute("mmdEdgeScale");
  const outlineMaterials = materialInfos.map((material, index) =>
    createMmdOutlineMaterial(material, index, sourceMaterials, options, hasVertexEdgeScale)
  );

  const outline = new THREE.SkinnedMesh(
    model.mesh.geometry,
    outlineMaterials.length === 1 ? outlineMaterials[0] : outlineMaterials
  );
  outline.name = `${model.mesh.name || "mmd"} outline`;
  const scale = options.scale ?? computeMmdOutlineScale(materialInfos);
  outline.scale.setScalar(scale === 1 && options.forceFallback ? 1.005 : scale);
  outline.bind(model.mesh.skeleton, model.mesh.bindMatrix);
  outline.renderOrder = model.mesh.renderOrder - 1;
  outline.userData.mmdOutlineProxy = { source: "combined" };
  return outline;
}

export function createMmdOutlineMeshes(
  model: MmdOutlineModelSource,
  options: MmdOutlineOptions = {}
): THREE.SkinnedMesh[] {
  const materialInfos = model.materials;
  if (
    !options.forceFallback &&
    !materialInfos.some((material) => material.flags.edge && material.edgeSize > 0)
  ) {
    return [];
  }
  const sourceMaterials = Array.isArray(model.mesh.material)
    ? model.mesh.material
    : [model.mesh.material];
  const hasVertexEdgeScale = !!model.mesh.geometry.getAttribute("mmdEdgeScale");
  const meshes: THREE.SkinnedMesh[] = [];
  for (let materialIndex = 0; materialIndex < materialInfos.length; materialIndex += 1) {
    const materialInfo = materialInfos[materialIndex];
    const hasEdge = !!materialInfo?.flags.edge && materialInfo.edgeSize > 0;
    if (!materialInfo || (!hasEdge && !options.forceFallback)) {
      continue;
    }
    const group = model.mesh.geometry.groups.find((item) => item.materialIndex === materialIndex);
    if (!group) {
      continue;
    }
    const geometry = model.mesh.geometry.clone();
    geometry.clearGroups();
    geometry.addGroup(group.start, group.count, 0);
    geometry.setDrawRange(group.start, group.count);
    const outlineMaterial = createMmdOutlineMaterial(
      materialInfo,
      materialIndex,
      sourceMaterials,
      options,
      hasVertexEdgeScale
    );
    const outline = new THREE.SkinnedMesh(geometry, outlineMaterial);
    outline.name = `${model.mesh.name || "mmd"} outline material ${materialIndex}`;
    outline.scale.setScalar(options.scale ?? 1);
    outline.bind(model.mesh.skeleton, model.mesh.bindMatrix);
    outline.morphTargetDictionary = model.mesh.morphTargetDictionary;
    outline.morphTargetInfluences = model.mesh.morphTargetInfluences;
    outline.renderOrder = model.mesh.renderOrder - 1;
    outline.frustumCulled = model.mesh.frustumCulled;
    outline.userData.mmdOutlineProxy = {
      sourceMaterialIndex: materialIndex,
      edgeSize: materialInfo.edgeSize,
      fallback: !hasEdge && !!options.forceFallback
    };
    meshes.push(outline);
  }
  return meshes;
}

function createMmdOutlineMaterial(
  material: MaterialInfo,
  index: number,
  sourceMaterials: readonly THREE.Material[],
  options: MmdOutlineOptions,
  hasVertexEdgeScale: boolean
): THREE.MeshBasicMaterial {
  const sourceMaterial = sourceMaterials[index] ?? sourceMaterials[0];
  const sourceMap =
    sourceMaterial && "map" in sourceMaterial && sourceMaterial.map instanceof THREE.Texture
      ? sourceMaterial.map
      : undefined;
  const hasEdge = material.flags.edge && material.edgeSize > 0;
  const suppressColor = mmdMaterialSuppressesColorAtAlpha(material.diffuse[3], material.flags);
  const visible = !suppressColor && (hasEdge || !!options.forceFallback);
  const alphaTest = sourceMap ? mmdOutlineAlphaTest(sourceMaterial, options) : 0;
  const alphaBlend = hasEdge && material.edgeColor[3] < 1;
  const parameters: THREE.MeshBasicMaterialParameters = {
    color: hasEdge
      ? new THREE.Color(material.edgeColor[0], material.edgeColor[1], material.edgeColor[2])
      : new THREE.Color(options.fallbackColor ?? 0x05070a),
    opacity: visible ? clampColor(hasEdge ? material.edgeColor[3] : 1) : 0,
    transparent: !visible || alphaBlend,
    side: THREE.BackSide,
    depthWrite: visible && !alphaBlend,
    depthTest: true,
    toneMapped: false,
    alphaTest
  };
  if (sourceMap) {
    parameters.map = sourceMap;
  }
  const outlineMaterial = new THREE.MeshBasicMaterial(parameters);
  const outlineWidth = mmdOutlineExpansionWidth(material, options, hasEdge);
  attachMmdOutlineExpansion(outlineMaterial, outlineWidth, hasVertexEdgeScale);
  outlineMaterial.visible = visible;
  outlineMaterial.userData.mmdOutlineMaterial = {
    edgeColor: [...material.edgeColor],
    edgeSize: material.edgeSize,
    flags: { ...material.flags },
    outlineWidth,
    shaderApplied: true,
    vertexEdgeScale: hasVertexEdgeScale,
    sourceMaterialIndex: index,
    alphaCutout: !!sourceMap,
    alphaTest,
    fallback: !hasEdge && !!options.forceFallback
  };
  return outlineMaterial;
}

function mmdOutlineAlphaTest(
  sourceMaterial: THREE.Material | undefined,
  options: MmdOutlineOptions
): number {
  if (
    sourceMaterial &&
    "alphaTest" in sourceMaterial &&
    typeof sourceMaterial.alphaTest === "number"
  ) {
    return sourceMaterial.alphaTest > 0 ? sourceMaterial.alphaTest : (options.alphaTest ?? 0.01);
  }
  return options.alphaTest ?? 0.01;
}

export function attachMmdOutlineExpansion(
  material: THREE.Material,
  outlineWidth: number,
  hasVertexEdgeScale: boolean
): void {
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms.mmdOutlineWidth = { value: outlineWidth };
    material.userData.mmdOutlineShader = shader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      [
        "#include <common>",
        "uniform float mmdOutlineWidth;",
        hasVertexEdgeScale ? "attribute float mmdEdgeScale;" : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      [
        "#include <begin_vertex>",
        hasVertexEdgeScale
          ? "transformed += normal * mmdOutlineWidth * mmdEdgeScale;"
          : "transformed += normal * mmdOutlineWidth;"
      ].join("\n")
    );
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey()}-yw-mmd-outline-expansion${
      hasVertexEdgeScale ? "-edge-scale" : ""
    }`;
  material.needsUpdate = true;
}

function mmdOutlineExpansionWidth(
  material: MaterialInfo,
  options: MmdOutlineOptions,
  hasEdge: boolean
): number {
  const edgeSize = hasEdge ? material.edgeSize : options.forceFallback ? 0.5 : 0;
  return Math.min(Math.max(edgeSize, 0), 3) / MMD_OUTLINE_MODEL_SPACE_SCALE;
}

export function computeMmdOutlineScale(materials: readonly MaterialInfo[]): number {
  const maxEdgeSize = Math.max(
    ...materials.map((material) => (material.flags.edge ? material.edgeSize : 0)),
    0
  );
  if (maxEdgeSize <= 0) {
    return 1;
  }
  return 1 + Math.min(Math.max(maxEdgeSize, 0.5), 3) / MMD_OUTLINE_MODEL_SPACE_SCALE;
}

export function syncMmdOutlineMaterialStates(
  materials: THREE.Material | THREE.Material[],
  states: readonly MaterialRuntimeState[]
): void {
  const materialList = Array.isArray(materials) ? materials : [materials];
  materialList.forEach((material, fallbackIndex) => {
    const metadata = material.userData.mmdOutlineMaterial as
      | {
          sourceMaterialIndex?: number;
          fallback?: boolean;
          alphaCutout?: boolean;
          edgeColor?: number[];
          edgeSize?: number;
          flags?: MaterialInfo["flags"];
          outlineWidth?: number;
        }
      | undefined;
    const materialIndex = metadata?.sourceMaterialIndex ?? fallbackIndex;
    const state = states[materialIndex];
    if (!state) {
      return;
    }
    const alpha = clampColor(state.edgeColor[3]);
    if ("color" in material && material.color instanceof THREE.Color) {
      material.color.setRGB(
        clampColor(state.edgeColor[0]),
        clampColor(state.edgeColor[1]),
        clampColor(state.edgeColor[2])
      );
    }
    const outlineWidth = mmdOutlineRuntimeWidth(state.edgeSize, !!metadata?.fallback);
    const suppressColor = mmdMaterialSuppressesColorAtAlpha(state.diffuse[3], metadata?.flags);
    material.opacity = metadata?.fallback ? material.opacity : alpha;
    material.transparent = material.opacity < 1;
    material.visible = !suppressColor && (!!metadata?.fallback || (state.edgeSize > 0 && alpha > 0));
    material.depthWrite = material.visible && material.opacity >= 1;
    material.userData.mmdOutlineMaterial = {
      ...(metadata ?? {}),
      edgeColor: [...state.edgeColor],
      edgeSize: state.edgeSize,
      outlineWidth
    };
    const shader = material.userData.mmdOutlineShader as
      | { uniforms?: Record<string, { value: unknown }> }
      | undefined;
    const outlineUniform = shader?.uniforms?.mmdOutlineWidth;
    if (outlineUniform && typeof outlineUniform.value === "number") {
      outlineUniform.value = outlineWidth;
    }
    material.needsUpdate = true;
  });
}

function mmdOutlineRuntimeWidth(edgeSize: number, fallback: boolean): number {
  if (fallback && edgeSize <= 0) {
    return 0.5 / MMD_OUTLINE_MODEL_SPACE_SCALE;
  }
  return Math.min(Math.max(edgeSize, 0), 3) / MMD_OUTLINE_MODEL_SPACE_SCALE;
}
