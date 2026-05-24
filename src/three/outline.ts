import type { MaterialInfo, MaterialRuntimeState } from "../parser/model/modelTypes.js";
import * as THREE from "three";

import {
  computeMmdMaterialRenderOrder,
  mmdMaterialCastsShadow,
  mmdMaterialSuppressesColorAtAlpha
} from "./material/material-metadata.js";
import type {
  MmdMaterialRenderOrderEntry
} from "./material/material-metadata.js";
import type { MmdMaterialTransparencyMode } from "./textures.js";
import { clampColor } from "./utils.js";

const MMD_OUTLINE_SCREEN_SPACE_SCALE = 300;

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

export interface MmdMaterialRenderOrderMeshOptions {
  readonly renderOrderBase?: number;
}

export interface MmdOutlineRenderOrderOptions {
  readonly renderOrderBase?: number;
}

export function createMmdOutlineMeshes(
  model: MmdOutlineModelSource,
  options: MmdOutlineOptions & MmdOutlineRenderOrderOptions = {}
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
  const renderOrder = mmdMaterialRenderOrderEntries(model);
  const renderOrderByMaterial = mmdMaterialRenderOrderMap(renderOrder);
  const outlineRenderOrderOffset = renderOrder.length;
  const renderOrderBase = options.renderOrderBase ?? model.mesh.renderOrder;
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
    const geometry = createMmdMaterialProxyGeometry(model.mesh.geometry, group);
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
    outline.renderOrder =
      renderOrderBase +
      outlineRenderOrderOffset +
      (renderOrderByMaterial.get(materialIndex) ?? materialIndex);
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
  // The outline reuses the body map so Three.js MeshBasicMaterial can discard
  // cutout pixels through its built-in alphatest_fragment shader chunk.
  const alphaTest = sourceMap ? mmdOutlineAlphaTest(sourceMaterial, options) : 0;
  const parameters: THREE.MeshBasicMaterialParameters = {
    color: hasEdge
      ? new THREE.Color(material.edgeColor[0], material.edgeColor[1], material.edgeColor[2])
      : new THREE.Color(options.fallbackColor ?? 0x05070a),
    opacity: visible ? clampColor(hasEdge ? material.edgeColor[3] : 1) : 0,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
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
      "#include <project_vertex>",
      [
        "#include <project_vertex>",
        "vec3 mmdOutlineNormal = -objectNormal;",
        "vec4 mmdOutlineOffsetPosition = projectionMatrix * modelViewMatrix * vec4( transformed + mmdOutlineNormal, 1.0 );",
        "vec4 mmdOutlineDirection = normalize( gl_Position - mmdOutlineOffsetPosition );",
        hasVertexEdgeScale
          ? "gl_Position += mmdOutlineDirection * mmdOutlineWidth * gl_Position.w * mmdEdgeScale;"
          : "gl_Position += mmdOutlineDirection * mmdOutlineWidth * gl_Position.w;"
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
  return Math.min(Math.max(edgeSize, 0), 3) / MMD_OUTLINE_SCREEN_SPACE_SCALE;
}

export function createMmdMaterialRenderOrderMeshes(
  model: MmdOutlineModelSource,
  options: MmdMaterialRenderOrderMeshOptions = {}
): THREE.SkinnedMesh[] {
  const sourceMaterials = Array.isArray(model.mesh.material)
    ? model.mesh.material
    : [model.mesh.material];
  const renderOrder = mmdMaterialRenderOrderEntries(model);
  const groups = model.mesh.geometry.groups;
  const renderOrderBase = options.renderOrderBase ?? model.mesh.renderOrder;
  const meshes: THREE.SkinnedMesh[] = [];
  for (const entry of renderOrder) {
    const group = groups.find((item) => item.materialIndex === entry.materialIndex);
    const material = sourceMaterials[entry.materialIndex];
    if (!group || !material) {
      continue;
    }
    const geometry = createMmdMaterialProxyGeometry(model.mesh.geometry, group);
    material.transparent = true;
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = `${model.mesh.name || "mmd"} material ${entry.materialIndex}`;
    mesh.bind(model.mesh.skeleton, model.mesh.bindMatrix);
    mesh.morphTargetDictionary = model.mesh.morphTargetDictionary;
    mesh.morphTargetInfluences = model.mesh.morphTargetInfluences;
    mesh.renderOrder = renderOrderBase + entry.renderOrder;
    mesh.frustumCulled = model.mesh.frustumCulled;
    const materialInfo = model.materials[entry.materialIndex];
    mesh.castShadow = !!materialInfo && mmdMaterialCastsShadow(materialInfo.flags);
    mesh.receiveShadow = !!materialInfo?.flags.selfShadow;
    mesh.userData.mmdMaterialRenderProxy = { ...entry };
    meshes.push(mesh);
  }
  return meshes;
}

function mmdMaterialRenderOrderEntries(
  model: MmdOutlineModelSource
): readonly MmdMaterialRenderOrderEntry[] {
  const sourceMaterials = Array.isArray(model.mesh.material)
    ? model.mesh.material
    : [model.mesh.material];
  return (
    (model.mesh.userData.mmdMaterialRenderOrder as MmdMaterialRenderOrderEntry[] | undefined) ??
    computeMmdMaterialRenderOrder(
      sourceMaterials.map((material, materialIndex) => ({
        materialIndex,
        transparencyMode:
          (material.userData.mmdMaterial?.transparencyMode as MmdMaterialTransparencyMode) ??
          "opaque"
      }))
    )
  );
}

function mmdMaterialRenderOrderMap(
  renderOrder: readonly MmdMaterialRenderOrderEntry[]
): Map<number, number> {
  return new Map(renderOrder.map((entry) => [entry.materialIndex, entry.renderOrder]));
}

function createMmdMaterialProxyGeometry(
  source: THREE.BufferGeometry,
  group: { readonly start: number; readonly count: number }
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  if (source.index) {
    geometry.setIndex(source.index);
  }
  const morphAttributes = geometry.morphAttributes as Record<
    string,
    Array<THREE.BufferAttribute | THREE.InterleavedBufferAttribute>
  >;
  for (const [name, attributes] of Object.entries(source.morphAttributes)) {
    morphAttributes[name] = attributes;
  }
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.boundingBox = source.boundingBox;
  geometry.boundingSphere = source.boundingSphere;
  geometry.userData = { ...source.userData };
  geometry.addGroup(group.start, group.count, 0);
  geometry.setDrawRange(group.start, group.count);
  return geometry;
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
    material.transparent = true;
    material.visible = !suppressColor && (!!metadata?.fallback || (state.edgeSize > 0 && alpha > 0));
    material.depthWrite = true;
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
    return 0.5 / MMD_OUTLINE_SCREEN_SPACE_SCALE;
  }
  return Math.min(Math.max(edgeSize, 0), 3) / MMD_OUTLINE_SCREEN_SPACE_SCALE;
}
