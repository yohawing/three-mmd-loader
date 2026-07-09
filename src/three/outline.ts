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
    const geometry = createMmdMaterialProxyGeometry(model.mesh.geometry, group);
    const outlineMaterial = createMmdOutlineMaterial(
      materialInfo,
      materialIndex,
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
    attachMmdOutlineViewportUpdate(outline);
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
    // The hull is shifted ~2*outlineWidth screen pixels sideways, so at a given pixel
    // its interpolated depth leads the body's by up to (slope x shift). A slope factor
    // of 1 only compensates one pixel of slope; scale it with the shift so front-facing
    // hull fragments (DoubleSide materials) always lose against their own body.
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
        hasVertexEdgeScale ? "attribute float mmdEdgeScale;" : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
    const outlineViewport = new THREE.Vector2();
    const currentViewport = new THREE.Vector4();
    updateMmdOutlineViewport(renderer, outlineViewport, currentViewport);
    shader.uniforms.mmdOutlineViewport = { value: outlineViewport };
    material.userData.mmdOutlineUpdateViewport = (activeRenderer: THREE.WebGLRenderer) => {
      updateMmdOutlineViewport(activeRenderer, outlineViewport, currentViewport);
    };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      [
        "#include <project_vertex>",
        "vec3 mmdOutlineViewNormal = mat3( modelViewMatrix ) * objectNormal;",
        "vec2 mmdOutlineScreenNormal = mmdOutlineViewNormal.xy;",
        "float mmdOutlineScreenNormalLength = length( mmdOutlineScreenNormal );",
        "mmdOutlineScreenNormal = mmdOutlineScreenNormalLength > 0.0 ? mmdOutlineScreenNormal / mmdOutlineScreenNormalLength : vec2( 0.0 );",
        hasVertexEdgeScale
          ? "gl_Position.xy += mmdOutlineScreenNormal / ( mmdOutlineViewport * 0.25 ) * mmdOutlineWidth * gl_Position.w * mmdEdgeScale;"
          : "gl_Position.xy += mmdOutlineScreenNormal / ( mmdOutlineViewport * 0.25 ) * mmdOutlineWidth * gl_Position.w;"
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
  outline.onBeforeRender = (renderer) => {
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
  currentViewport: THREE.Vector4
): void {
  renderer.getCurrentViewport(currentViewport);
  // getCurrentViewport reports DEVICE pixels (pixelRatio applied). The edge
  // expansion divides by this viewport, so a raw device viewport makes the edge
  // width scale as 1/pixelRatio -- i.e. the outline gets thinner on hi-DPI
  // displays or under supersampling, and thicker at pixelRatio 1. Real MMD's edge
  // is a fixed screen-space width independent of render resolution, so normalise
  // to CSS pixels here to keep the outline thickness DPI/supersample invariant.
  const pixelRatio = renderer.getPixelRatio?.() || 1;
  target.set(currentViewport.z / pixelRatio, currentViewport.w / pixelRatio);
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
    const geometry = createMmdMaterialProxyGeometry(model.mesh.geometry, group);
    const mesh = new THREE.SkinnedMesh(
      geometry,
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
    mesh.userData.mmdMaterialRenderProxy = { ...entry };
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
