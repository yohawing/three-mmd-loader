import type { MaterialFlags, MaterialRuntimeState } from "../parser/model/modelTypes.js";
import * as THREE from "three/webgpu";
import * as TSL from "three/tsl";

import {
  createMmdTslToonMaterial,
  syncMmdTslMaterialState,
  type MmdTslMaterialCoreOptions
} from "./material-core.js";

type MmdSourceMaterial = THREE.Material & {
  map?: THREE.Texture | null;
  gradientMap?: THREE.Texture | null;
};

interface MmdMaterialMetadata {
  diffuse?: readonly number[];
  ambient?: readonly number[];
  specular?: readonly number[];
  specularPower?: number;
  edgeColor?: readonly number[];
  edgeSize?: number;
  sphereMode?: MmdTslMaterialCoreOptions["sphereMode"];
  flags?: Partial<MaterialFlags>;
}

interface MmdSphereMapUserData {
  texture?: THREE.Texture;
}

interface MmdTslTextureReferences {
  readonly diffuseMap?: THREE.Texture;
  readonly toonMap?: THREE.Texture;
  readonly sphereMap?: THREE.Texture;
}

interface MmdSourceMaterialDisposalState {
  disposed: boolean;
}

const sourceMaterialDisposalStates = new WeakMap<THREE.Material, MmdSourceMaterialDisposalState>();

export interface MmdTslMaterialAssemblyOptions {
  readonly respectMaterialShadowFlags?: boolean;
  readonly appendOutlineGroups?: boolean;
  readonly forceOutlineGroups?: boolean;
  readonly dedicatedShadowVisibilityNode?: THREE.Node<"float">;
  /**
   * When true, materials emit gamma-space composite RGB and must be paired with
   * `renderer.outputColorSpace = LinearSRGBColorSpace` for legacy WebGL framebuffer
   * blending parity. Default false keeps experimental linear output + SRGBColorSpace.
   */
  readonly legacySrgbFramebuffer?: boolean;
  /**
   * Set when the target renderer uses a reversed depth buffer (native WebGPU
   * with `reversedDepthBuffer: true`). Three's WebGPU backend does not
   * auto-negate `polygonOffsetFactor`/`polygonOffsetUnits` for reversed depth
   * (node_modules/three/src/renderers/webgpu/utils/WebGPUPipelineUtils.js
   * ~line 259-262 maps them straight to `depthBias`/`depthBiasSlopeScale`
   * with no `reversedDepthBuffer` branch, unlike the depth-compare function
   * a few lines below at ~line 797). A positive depth bias always increases
   * the raw stored device depth; under the non-reversed near->0/far->1
   * mapping that pushes the outline farther away as intended, but under the
   * reversed near->1/far->0 mapping the same positive bias pushes it closer
   * to the camera instead. Negate factor/units here so the outline still
   * gets pushed away from the camera under reversed depth.
   */
  readonly reversedDepth?: boolean;
}

export function createMmdTslMaterialFromSource(
  sourceMaterial: THREE.Material,
  options: MmdTslMaterialAssemblyOptions = {}
): THREE.MeshToonNodeMaterial {
  const metadata = readMmdMaterialMetadata(sourceMaterial);
  const textures = readMmdTslTextureReferences(sourceMaterial);
  const material = createMmdTslToonMaterial({
    diffuse: readVec3(metadata.diffuse, [1, 1, 1]),
    ambient: readVec3(metadata.ambient, [0, 0, 0]),
    specular: readVec3(metadata.specular, [0, 0, 0]),
    specularPower: readFiniteNumber(metadata.specularPower, 0),
    diffuseMap: textures.diffuseMap,
    toonMap: textures.toonMap,
    sphereMap: textures.sphereMap,
    sphereMode: metadata.sphereMode ?? "none",
    // Only receiver materials participate in the dedicated pass.  Caster-only
    // and explicitly non-receiving PMX materials keep the legacy graph so the
    // dedicated visibility cannot darken them as they render into the model.
    dedicatedShadowVisibilityNode:
      metadata.flags?.selfShadow === true
        ? options.dedicatedShadowVisibilityNode
        : undefined,
    gammaSpaceComposite:
      textures.diffuseMap !== undefined ||
      textures.toonMap !== undefined ||
      textures.sphereMap !== undefined,
    legacySrgbFramebuffer: options.legacySrgbFramebuffer === true
  });
  material.userData.mmdMaterial = {
    ...metadata,
    flags: metadata.flags ? { ...metadata.flags } : undefined
  };
  material.userData.mmdTslSourceRenderFlags = {
    transparent: sourceMaterial.transparent,
    depthWrite: sourceMaterial.depthWrite
  };
  // NodeMaterial texture nodes do not expose their source textures as material
  // properties. Keep the references on userData so disposeMmdModel can apply
  // its normal ownership policy after the legacy material is released.
  material.userData.mmdTslTextureReferences = textures;
  material.userData.mmdTslSourceDiffuseTexture = textures.diffuseMap;
  material.userData.mmdTslSourceToonTexture = textures.toonMap;
  material.userData.mmdTslSourceSphereTexture = textures.sphereMap;
  material.side = sourceMaterial.side;
  // MMD renders no-cull materials in one draw. Keep that contract if a material
  // morph later changes an initially opaque material into a transparent one.
  material.forceSinglePass = metadata.flags?.doubleSided === true && sourceMaterial.side === THREE.DoubleSide;
  material.alphaTest = sourceMaterial.alphaTest;
  syncMmdTslMaterialState(material, createMaterialRuntimeStateForSource(sourceMaterial, metadata, textures.sphereMap));
  if (options.respectMaterialShadowFlags !== false && !mmdMaterialCastsShadow(metadata.flags)) {
    material.castShadowNode = TSL.Fn(() => {
      TSL.Discard();
      return TSL.vec4(0, 0, 0, 0);
    })();
  }
  return material;
}

function disposeSourceMaterialOnce(sourceMaterial: THREE.Material): () => void {
  let state = sourceMaterialDisposalStates.get(sourceMaterial);
  if (!state) {
    state = { disposed: false };
    sourceMaterialDisposalStates.set(sourceMaterial, state);
    const disposalState = state;
    sourceMaterial.addEventListener("dispose", () => {
      disposalState.disposed = true;
    });
  }
  const disposalState = state;
  return () => {
    if (disposalState.disposed) {
      return;
    }
    disposalState.disposed = true;
    sourceMaterial.dispose();
  };
}

export function replaceMmdModelMaterialsWithTsl(
  mesh: THREE.Mesh,
  options: MmdTslMaterialAssemblyOptions = {}
): void {
  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const nodeMaterials = sourceMaterials.map((sourceMaterial) => {
    const nodeMaterial = createMmdTslMaterialFromSource(sourceMaterial, options);
    // Replacement transfers the source material's lifetime to the node
    // material without disposing textures that remain in the TSL graph.
    nodeMaterial.addEventListener("dispose", disposeSourceMaterialOnce(sourceMaterial));
    return nodeMaterial;
  });
  mesh.material = Array.isArray(mesh.material) ? nodeMaterials : nodeMaterials[0];
  if (options.appendOutlineGroups === true) {
    appendMmdTslOutlineGroups(mesh, options);
  }
}

export function appendMmdTslOutlineGroups(
  mesh: THREE.Mesh,
  options: MmdTslMaterialAssemblyOptions = {}
): number {
  const materialList = Array.isArray(mesh.material) ? [...mesh.material] : [mesh.material];
  const bodyGroups = mesh.geometry.groups.map((group) => ({
    start: group.start,
    count: group.count,
    materialIndex: group.materialIndex ?? 0
  }));
  let appended = 0;
  for (const group of bodyGroups) {
    const sourceMaterial = materialList[group.materialIndex];
    if (!sourceMaterial) {
      continue;
    }
    const metadata = readMmdMaterialMetadata(sourceMaterial);
    if (!mmdMaterialHasVisibleOutline(metadata, options.forceOutlineGroups === true)) {
      continue;
    }
    const outlineMaterial = createMmdTslOutlineMaterial(metadata, options, group.materialIndex);
    const outlineMaterialIndex = materialList.length;
    materialList.push(outlineMaterial);
    mesh.geometry.addGroup(group.start, group.count, outlineMaterialIndex);
    appended += 1;
  }
  if (appended > 0) {
    mesh.material = materialList;
  }
  return appended;
}

function createMmdTslOutlineMaterial(
  metadata: MmdMaterialMetadata,
  options: MmdTslMaterialAssemblyOptions,
  sourceMaterialIndex: number
): THREE.MeshBasicNodeMaterial {
  const force = options.forceOutlineGroups === true;
  const edgeColor = mmdTslOutlineColor(metadata, force);
  const outlineWidth = mmdTslOutlineWidth(metadata, force);
  const polygonOffsetSign = options.reversedDepth === true ? -1 : 1;
  const outlineUniforms = {
    color: new THREE.Vector3(edgeColor[0], edgeColor[1], edgeColor[2]),
    opacity: TSL.uniform(edgeColor[3], "float") as unknown as ReturnType<typeof TSL.float> & { value: number },
    width: TSL.uniform(outlineWidth, "float") as unknown as ReturnType<typeof TSL.float> & { value: number }
  };
  const material = new THREE.MeshBasicNodeMaterial({
    color: new THREE.Color(edgeColor[0], edgeColor[1], edgeColor[2]),
    opacity: edgeColor[3],
    transparent: true,
    side: THREE.BackSide,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: polygonOffsetSign * (1 + 2 * outlineWidth),
    polygonOffsetUnits: polygonOffsetSign * 1,
    toneMapped: false
  });
  material.colorNode = TSL.uniform(outlineUniforms.color);
  material.opacityNode = outlineUniforms.opacity;
  material.vertexNode = createMmdTslScreenSpaceOutlineVertexNode(outlineUniforms.width);
  material.castShadowNode = TSL.Fn(() => {
    TSL.Discard();
    return TSL.vec4(0, 0, 0, 0);
  })();
  material.castShadowPositionNode = TSL.positionLocal;
  material.userData.mmdTslOutlineMaterial = {
    sourceMaterialIndex,
    fallback: force,
    sourceEdgeSize: metadata.edgeSize ?? 0,
    edgeColor,
    flags: metadata.flags ? { ...metadata.flags } : undefined,
    shaderApplied: true,
    uniforms: outlineUniforms,
    polygonOffsetSign
  };
  return material;
}

interface TslVectorNodeOps {
  readonly w: unknown;
  add(value: unknown): TslVectorNodeOps;
  sub(value: unknown): TslVectorNodeOps;
  mul(value: unknown): TslVectorNodeOps;
}

function createMmdTslScreenSpaceOutlineVertexNode(outlineWidth: THREE.Node): THREE.Node {
  const outlineWidthNode = outlineWidth as unknown as TslVectorNodeOps;
  const mvp = TSL.cameraProjectionMatrix.mul(TSL.modelViewMatrix) as unknown as {
    mul(value: unknown): TslVectorNodeOps;
  };
  const outlineNormal = TSL.normalLocal.negate();
  const pos = mvp.mul(TSL.vec4(TSL.positionLocal, 1));
  const pos2 = mvp.mul(TSL.vec4(TSL.positionLocal.add(outlineNormal), 1));
  const normalizeNode = TSL.normalize as unknown as (value: unknown) => TslVectorNodeOps;
  const direction = normalizeNode(pos.sub(pos2));
  return pos.add(direction.mul(outlineWidthNode.mul(0.004)).mul(pos.w)) as unknown as THREE.Node;
}

function createMaterialRuntimeStateForSource(
  sourceMaterial: THREE.Material,
  metadata: MmdMaterialMetadata,
  sphereTexture: THREE.Texture | undefined
): MaterialRuntimeState {
  const existingState = sourceMaterial.userData.mmdMaterialState as MaterialRuntimeState | undefined;
  if (existingState) {
    return existingState;
  }
  return {
    diffuse: readVec4(metadata.diffuse, [1, 1, 1, sourceMaterial.opacity]),
    specular: readVec3(metadata.specular, [0, 0, 0]),
    specularPower: readFiniteNumber(metadata.specularPower, 0),
    ambient: readVec3(metadata.ambient, [0, 0, 0]),
    edgeColor: [0, 0, 0, 1],
    edgeSize: 1,
    textureFactor: [1, 1, 1, 1],
    sphereTextureFactor: sphereTexture ? [1, 1, 1, 1] : [0, 0, 0, 0],
    toonTextureFactor: [1, 1, 1, 1]
  };
}

function readMmdMaterialMetadata(material: THREE.Material): MmdMaterialMetadata {
  return (material.userData.mmdMaterial ?? {}) as MmdMaterialMetadata;
}

function readMmdSphereTexture(material: THREE.Material): THREE.Texture | undefined {
  const userData = material.userData as {
    mmdSphereMap?: MmdSphereMapUserData;
    mmdSphereTexture?: THREE.Texture;
  };
  return userData.mmdSphereMap?.texture ?? userData.mmdSphereTexture;
}

function readMmdTslTextureReferences(material: THREE.Material): MmdTslTextureReferences {
  const source = material as MmdSourceMaterial;
  const userData = material.userData as { mmdTslTextureReferences?: MmdTslTextureReferences };
  const retained = userData.mmdTslTextureReferences;
  return {
    diffuseMap: source.map ?? retained?.diffuseMap,
    toonMap: source.gradientMap ?? retained?.toonMap,
    sphereMap: readMmdSphereTexture(material) ?? retained?.sphereMap
  };
}

function mmdMaterialCastsShadow(flags: Partial<MaterialFlags> | undefined): boolean {
  return flags?.groundShadow === true || flags?.selfShadowMap === true;
}

function mmdMaterialHasVisibleOutline(metadata: MmdMaterialMetadata, force: boolean): boolean {
  const edgeColor = mmdTslOutlineColor(metadata, force);
  return (force || metadata.flags?.edge === true) && mmdTslOutlineWidth(metadata, force) > 0 && edgeColor[3] > 0;
}

function mmdTslOutlineWidth(metadata: MmdMaterialMetadata, force: boolean): number {
  const width = metadata.edgeSize ?? 0;
  return Math.max(force && width <= 0 ? 0.5 : width, 0);
}

function mmdTslOutlineColor(metadata: MmdMaterialMetadata, force: boolean): [number, number, number, number] {
  const edgeColor = readVec4(metadata.edgeColor, [0, 0, 0, 1]);
  return force && edgeColor[3] <= 0 ? [edgeColor[0], edgeColor[1], edgeColor[2], 1] : edgeColor;
}

function readVec3(value: readonly number[] | undefined, fallback: readonly [number, number, number]): [number, number, number] {
  return value && value.length >= 3
    ? [value[0] ?? fallback[0], value[1] ?? fallback[1], value[2] ?? fallback[2]]
    : [fallback[0], fallback[1], fallback[2]];
}

function readVec4(
  value: readonly number[] | undefined,
  fallback: readonly [number, number, number, number]
): [number, number, number, number] {
  return value && value.length >= 4
    ? [
        value[0] ?? fallback[0],
        value[1] ?? fallback[1],
        value[2] ?? fallback[2],
        value[3] ?? fallback[3]
      ]
    : [fallback[0], fallback[1], fallback[2], fallback[3]];
}

function readFiniteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
