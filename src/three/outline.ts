import type { MaterialInfo, MaterialRuntimeState } from "../parser/model/modelTypes.js";
import * as THREE from "three";

import {
  computeMmdMaterialRenderOrder,
  mmdMaterialCastsShadow,
  mmdMaterialCastsSelfShadow,
  mmdMaterialSuppressesColorAtAlpha
} from "./material/material-metadata.js";
import { createMmdShadowDepthMaterial } from "./material/material-shadow.js";
import { MMD_SELF_SHADOW_LAYER } from "./shadow.js";
import type {
  MmdMaterialRenderOrderEntry
} from "./material/material-metadata.js";
import type { MmdMaterialTransparencyMode } from "./textures.js";
import { clampColor } from "./utils.js";

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
  readonly shadowOnly?: boolean;
  readonly selfShadowLayer?: number;
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
    const outlineMaterial = createMmdOutlineMaterial(
      materialInfo,
      materialIndex,
      options,
      hasVertexEdgeScale
    );
    const outline = new THREE.SkinnedMesh(model.mesh.geometry, outlineMaterial);
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
      fallback: !hasEdge && !!options.forceFallback,
      start: group.start,
      count: group.count
    };
    attachMmdOutlineViewportUpdate(outline);
    attachMmdMaterialProxyDrawRange(outline, group.start, group.count);
    meshes.push(outline);
  }
  return meshes;
}

function createMmdOutlineMaterial(
  material: MaterialInfo,
  index: number,
  options: MmdOutlineOptions,
  hasVertexEdgeScale: boolean
): THREE.MeshBasicMaterial {
  const hasEdge = material.flags.edge && material.edgeSize > 0;
  const suppressColor = mmdMaterialSuppressesColorAtAlpha(material.diffuse[3], material.flags);
  const visible = !suppressColor && (hasEdge || !!options.forceFallback);
  // Edge x texture-alpha policy (shading-note §12): real MMD 9.32 draws a FLAT,
  // texture-independent inverted-hull edge (saba mmd_edge.frag never samples the body
  // texture). Verified against the golden: the solid black edge shows THROUGH a cutout
  // body's holes (mmd-texture-alpha-used-uv-cutout 0.043 -> 0.013) and keeps the rim on a
  // soft-alpha body (mmd-tga-regular-hair-alpha-opaque). Binding/clipping the edge by the
  // body map (the old babylon-style behaviour) both eroded soft rims and let the white
  // background show through cutout holes, so the edge never binds the body map.
  //
  // The edge hull stays BackSide even for both-face materials: the golden for the TGA
  // soft-alpha box shows the interior far face blending over the BACKGROUND through the
  // body's zero-alpha holes — a camera-facing hull face would paint those holes black
  // (verified: a DoubleSide hull regressed mmd-tga-regular-hair-alpha-opaque). The
  // both-face ramp quad still gets its black zero-alpha band because its triangles face
  // away from the camera, so the BackSide hull is what rasterises there.
  const outlineWidth = mmdOutlineExpansionWidth(material, options, hasEdge);
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
    // The hull is shifted outlineWidth CSS pixels sideways, so at a given pixel
    // its interpolated depth leads the body's by up to (slope x shift). A slope factor
    // of 1 only compensates one pixel of slope. Keep a conservative 2x depth-only
    // margin so front-facing hull fragments always lose against their own body.
    polygonOffsetFactor: mmdOutlinePolygonOffsetFactor(outlineWidth),
    polygonOffsetUnits: 1,
    toneMapped: false,
    alphaTest: 0
  };
  const outlineMaterial = new THREE.MeshBasicMaterial(parameters);
  attachMmdPmxOutlineExpansion(outlineMaterial, outlineWidth, hasVertexEdgeScale);
  outlineMaterial.visible = visible;
  outlineMaterial.userData.mmdOutlineMaterial = {
    edgeColor: [...material.edgeColor],
    edgeSize: material.edgeSize,
    flags: { ...material.flags },
    outlineWidth,
    shaderApplied: true,
    vertexEdgeScale: hasVertexEdgeScale,
    sourceMaterialIndex: index,
    alphaCutout: false,
    alphaTest: 0,
    fallback: !hasEdge && !!options.forceFallback
  };
  return outlineMaterial;
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

function attachMmdPmxOutlineExpansion(
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
        "uniform vec2 mmdOutlineViewport;",
        "uniform float mmdOutlinePixelRatio;",
        hasVertexEdgeScale ? "attribute float mmdEdgeScale;" : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
    const outlineViewport = new THREE.Vector2();
    const currentViewport = new THREE.Vector4();
    const outlinePixelRatio = { value: 1 };
    updateMmdOutlineViewport(renderer, outlineViewport, currentViewport, outlinePixelRatio);
    shader.uniforms.mmdOutlineViewport = { value: outlineViewport };
    shader.uniforms.mmdOutlinePixelRatio = outlinePixelRatio;
    material.userData.mmdOutlineUpdateViewport = (activeRenderer: THREE.WebGLRenderer) => {
      updateMmdOutlineViewport(activeRenderer, outlineViewport, currentViewport, outlinePixelRatio);
    };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      [
        "#include <project_vertex>",
        "vec3 mmdOutlineViewNormal = mat3( modelViewMatrix ) * objectNormal;",
        "vec2 mmdOutlineScreenNormal = mmdOutlineViewNormal.xy;",
        "float mmdOutlineScreenNormalLength = length( mmdOutlineScreenNormal );",
        "mmdOutlineScreenNormal = mmdOutlineScreenNormalLength > 0.0 ? mmdOutlineScreenNormal / mmdOutlineScreenNormalLength : vec2( 0.0 );",
        "vec2 mmdOutlinePixelScale = vec2( 2.0 * mmdOutlinePixelRatio ) / mmdOutlineViewport;",
        hasVertexEdgeScale
          ? "gl_Position.xy += mmdOutlineScreenNormal * mmdOutlinePixelScale * mmdOutlineWidth * gl_Position.w * mmdEdgeScale;"
          : "gl_Position.xy += mmdOutlineScreenNormal * mmdOutlinePixelScale * mmdOutlineWidth * gl_Position.w;"
      ].join("\n")
    );
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey()}-yw-mmd-pmx-outline-expansion${
      hasVertexEdgeScale ? "-edge-scale" : ""
    }`;
  material.needsUpdate = true;
}

function attachMmdOutlineViewportUpdate(outline: THREE.SkinnedMesh): void {
  const previousOnBeforeRender = outline.onBeforeRender;
  outline.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    previousOnBeforeRender.call(outline, renderer, scene, camera, geometry, material, group);
    syncMmdOutlineViewport(outline.material, renderer);
  };
}

function syncMmdOutlineViewport(
  materials: THREE.Material | THREE.Material[],
  renderer: THREE.WebGLRenderer
): void {
  if (Array.isArray(materials)) {
    for (const material of materials) {
      syncMmdOutlineMaterialViewport(material, renderer);
    }
    return;
  }
  syncMmdOutlineMaterialViewport(materials, renderer);
}

function syncMmdOutlineMaterialViewport(
  material: THREE.Material,
  renderer: THREE.WebGLRenderer
): void {
  const updateViewport = material.userData.mmdOutlineUpdateViewport as
    | ((activeRenderer: THREE.WebGLRenderer) => void)
    | undefined;
  updateViewport?.(renderer);
}

function updateMmdOutlineViewport(
  renderer: THREE.WebGLRenderer,
  target: THREE.Vector2,
  currentViewport: THREE.Vector4,
  pixelRatioUniform: { value: number }
): void {
  renderer.getCurrentViewport(currentViewport);
  target.set(currentViewport.z, currentViewport.w);
  pixelRatioUniform.value = renderer.getPixelRatio?.() || 1;
}

function mmdOutlineExpansionWidth(
  material: MaterialInfo,
  options: MmdOutlineOptions,
  hasEdge: boolean
): number {
  const edgeSize = hasEdge ? material.edgeSize : options.forceFallback ? 0.5 : 0;
  return Math.max(edgeSize, 0);
}

function mmdOutlinePolygonOffsetFactor(outlineWidth: number): number {
  return 1 + 2 * Math.max(outlineWidth, 0);
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
  const selfShadowLayer = options.selfShadowLayer ?? MMD_SELF_SHADOW_LAYER;
  const meshes: THREE.SkinnedMesh[] = [];
  for (const entry of renderOrder) {
    const group = groups.find((item) => item.materialIndex === entry.materialIndex);
    const material = sourceMaterials[entry.materialIndex];
    if (!group || !material) {
      continue;
    }
    const mesh = new THREE.SkinnedMesh(
      model.mesh.geometry,
      options.shadowOnly ? createShadowOnlyMaterial(material) : material
    );
    mesh.name = `${model.mesh.name || "mmd"} material ${entry.materialIndex}`;
    mesh.bind(model.mesh.skeleton, model.mesh.bindMatrix);
    mesh.morphTargetDictionary = model.mesh.morphTargetDictionary;
    mesh.morphTargetInfluences = model.mesh.morphTargetInfluences;
    mesh.renderOrder = renderOrderBase + entry.renderOrder;
    mesh.frustumCulled = model.mesh.frustumCulled;
    const materialInfo = model.materials[entry.materialIndex];
    const castsSelfShadow = !!materialInfo && mmdMaterialCastsSelfShadow(materialInfo.flags);
    mesh.castShadow = !!materialInfo && mmdMaterialCastsShadow(materialInfo.flags);
    mesh.receiveShadow = !!materialInfo?.flags.selfShadow;
    if (castsSelfShadow) {
      mesh.layers.enable(selfShadowLayer);
    }
    if (mesh.castShadow) {
      mesh.customDepthMaterial = createMmdShadowDepthMaterial(material);
    }
    mesh.userData.mmdMaterialRenderProxy = { ...entry, start: group.start, count: group.count };
    attachMmdMaterialProxyDrawRange(mesh, group.start, group.count);
    meshes.push(mesh);
  }
  return meshes;
}

function createShadowOnlyMaterial(source: THREE.Material): THREE.Material {
  const material = source.clone();
  material.colorWrite = false;
  material.depthWrite = false;
  material.userData = {
    ...material.userData,
    mmdShadowOnlyRenderProxy: true
  };
  return material;
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

/**
 * Proxies share the source geometry object instead of owning a per-material
 * BufferGeometry: three caches the morph-target DataArrayTexture per geometry
 * object and sizes it by the whole position count, so per-proxy geometries
 * multiplied morph VRAM by the proxy count (issue #42). Each proxy narrows the
 * shared drawRange to its material group only around its own draw, shadow draw
 * and raycast, then restores the previous range. The previous range is kept
 * rather than a fixed (0, 0) because morph-split outlines share a body mesh
 * geometry that renders with its full range.
 */
function attachMmdMaterialProxyDrawRange(
  proxy: THREE.SkinnedMesh,
  groupStart: number,
  groupCount: number
): void {
  let renderStart = 0;
  let renderCount = 0;
  let shadowStart = 0;
  let shadowCount = 0;
  const previousOnBeforeRender = proxy.onBeforeRender;
  const previousOnAfterRender = proxy.onAfterRender;
  const previousOnBeforeShadow = proxy.onBeforeShadow;
  const previousOnAfterShadow = proxy.onAfterShadow;
  proxy.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    previousOnBeforeRender.call(proxy, renderer, scene, camera, geometry, material, group);
    const drawRange = proxy.geometry.drawRange;
    renderStart = drawRange.start;
    renderCount = drawRange.count;
    drawRange.start = groupStart;
    drawRange.count = groupCount;
  };
  proxy.onAfterRender = (renderer, scene, camera, geometry, material, group) => {
    const drawRange = proxy.geometry.drawRange;
    drawRange.start = renderStart;
    drawRange.count = renderCount;
    previousOnAfterRender.call(proxy, renderer, scene, camera, geometry, material, group);
  };
  proxy.onBeforeShadow = (renderer, scene, camera, shadowCamera, geometry, depthMaterial, group) => {
    previousOnBeforeShadow.call(
      proxy,
      renderer,
      scene,
      camera,
      shadowCamera,
      geometry,
      depthMaterial,
      group
    );
    const drawRange = proxy.geometry.drawRange;
    shadowStart = drawRange.start;
    shadowCount = drawRange.count;
    drawRange.start = groupStart;
    drawRange.count = groupCount;
  };
  proxy.onAfterShadow = (renderer, scene, camera, shadowCamera, geometry, depthMaterial, group) => {
    const drawRange = proxy.geometry.drawRange;
    drawRange.start = shadowStart;
    drawRange.count = shadowCount;
    previousOnAfterShadow.call(
      proxy,
      renderer,
      scene,
      camera,
      shadowCamera,
      geometry,
      depthMaterial,
      group
    );
  };
  proxy.raycast = (raycaster, intersects) => {
    const drawRange = proxy.geometry.drawRange;
    const previousStart = drawRange.start;
    const previousCount = drawRange.count;
    drawRange.start = groupStart;
    drawRange.count = groupCount;
    try {
      THREE.SkinnedMesh.prototype.raycast.call(proxy, raycaster, intersects);
    } finally {
      drawRange.start = previousStart;
      drawRange.count = previousCount;
    }
  };
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
    material.polygonOffsetFactor = mmdOutlinePolygonOffsetFactor(outlineWidth);
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
    return 0.5;
  }
  return Math.max(edgeSize, 0);
}
