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

export interface MmdTslMaterialAssemblyOptions {
  readonly respectMaterialShadowFlags?: boolean;
  readonly appendOutlineGroups?: boolean;
  readonly forceOutlineGroups?: boolean;
}

export function createMmdTslMaterialFromSource(
  sourceMaterial: THREE.Material,
  options: MmdTslMaterialAssemblyOptions = {}
): THREE.MeshToonNodeMaterial {
  const source = sourceMaterial as MmdSourceMaterial;
  const metadata = readMmdMaterialMetadata(sourceMaterial);
  const sphereTexture = readMmdSphereTexture(sourceMaterial);
  const material = createMmdTslToonMaterial({
    diffuse: readVec3(metadata.diffuse, [1, 1, 1]),
    ambient: readVec3(metadata.ambient, [0, 0, 0]),
    specular: readVec3(metadata.specular, [0, 0, 0]),
    specularPower: readFiniteNumber(metadata.specularPower, 0),
    diffuseMap: source.map ?? undefined,
    toonMap: source.gradientMap ?? undefined,
    sphereMap: sphereTexture,
    sphereMode: metadata.sphereMode ?? "none",
    gammaSpaceComposite: source.map != null || source.gradientMap != null || sphereTexture !== undefined
  });
  syncMmdTslMaterialState(material, createMaterialRuntimeStateForSource(sourceMaterial, metadata, sphereTexture));
  material.userData.mmdMaterial = {
    ...metadata,
    flags: metadata.flags ? { ...metadata.flags } : undefined
  };
  material.side = sourceMaterial.side;
  material.transparent = sourceMaterial.transparent;
  material.opacity = sourceMaterial.opacity;
  material.depthWrite = sourceMaterial.depthWrite;
  material.alphaTest = sourceMaterial.alphaTest;
  if (options.respectMaterialShadowFlags !== false && !mmdMaterialCastsShadow(metadata.flags)) {
    material.castShadowNode = TSL.Fn(() => {
      TSL.Discard();
      return TSL.vec4(0, 0, 0, 0);
    })();
  }
  return material;
}

export function replaceMmdModelMaterialsWithTsl(
  mesh: THREE.Mesh,
  options: MmdTslMaterialAssemblyOptions = {}
): void {
  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const nodeMaterials = sourceMaterials.map((sourceMaterial) =>
    createMmdTslMaterialFromSource(sourceMaterial, options)
  );
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
    const outlineMaterial = createMmdTslOutlineMaterial(metadata, options);
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
  options: MmdTslMaterialAssemblyOptions
): THREE.MeshBasicNodeMaterial {
  const force = options.forceOutlineGroups === true;
  const edgeColor = mmdTslOutlineColor(metadata, force);
  const outlineWidth = mmdTslOutlineWidth(metadata, force);
  const material = new THREE.MeshBasicNodeMaterial({
    color: new THREE.Color(edgeColor[0], edgeColor[1], edgeColor[2]),
    opacity: edgeColor[3],
    transparent: true,
    side: THREE.BackSide,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1 + 2 * outlineWidth,
    polygonOffsetUnits: 1,
    toneMapped: false
  });
  material.colorNode = TSL.vec3(edgeColor[0], edgeColor[1], edgeColor[2]);
  material.opacityNode = TSL.float(edgeColor[3]);
  material.vertexNode = createMmdTslScreenSpaceOutlineVertexNode(outlineWidth);
  material.castShadowNode = TSL.Fn(() => {
    TSL.Discard();
    return TSL.vec4(0, 0, 0, 0);
  })();
  material.castShadowPositionNode = TSL.positionLocal;
  material.userData.mmdTslOutlineMaterial = {
    sourceEdgeSize: metadata.edgeSize ?? 0,
    edgeColor,
    shaderApplied: true
  };
  return material;
}

function createMmdTslScreenSpaceOutlineVertexNode(outlineWidth: number): THREE.Node {
  const mvp = TSL.cameraProjectionMatrix.mul(TSL.modelViewMatrix);
  const outlineNormal = TSL.normalLocal.negate();
  const pos = mvp.mul(TSL.vec4(TSL.positionLocal, 1));
  const pos2 = mvp.mul(TSL.vec4(TSL.positionLocal.add(outlineNormal), 1));
  const direction = TSL.normalize(pos.sub(pos2));
  return pos.add(direction.mul(outlineWidth * 0.004).mul(pos.w));
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
