import * as THREE from "three";

import type { MaterialRuntimeState, MmdModel } from "../parser/model/modelTypes.js";
import { syncMorphSplitTargetInfluences } from "../runtime/morphSplitSync.js";
import { syncMmdMaterialStates } from "./material/material-sync.js";
import { mmdMaterialSuppressesColorAtAlpha } from "./material/material-metadata.js";
import { syncMmdOutlineMaterialStates } from "./outline.js";
import { clampColor } from "./utils.js";

export type MmdWorldMatrixColumnMajorTuple = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export type MmdWorldMatrixBuffer =
  | readonly number[]
  | Float32Array
  | Float64Array
  | MmdWorldMatrixColumnMajorTuple;

export interface MmdRuntimeMeshSyncSource {
  boneMatrices(): Float32Array;
  morphWeights(): Float32Array;
  propertyState(): { readonly visible: boolean };
  materialStates(): readonly MaterialRuntimeState[];
}

export interface ThreeMmdRuntimeSyncTarget {
  readonly mesh: THREE.SkinnedMesh;
  readonly outlineMeshes?: readonly THREE.SkinnedMesh[];
  readonly renderOrderMeshes?: readonly THREE.SkinnedMesh[];
}

const scratchWorldMatrices: THREE.Matrix4[] = [];
const scratchLocalMatrix = new THREE.Matrix4();

export function mmdWorldMatrixToThree(matrices: MmdWorldMatrixBuffer, index = 0): THREE.Matrix4 {
  return writeMmdWorldMatrixToThree(matrices, index, new THREE.Matrix4());
}

function writeMmdWorldMatrixToThree(
  matrices: MmdWorldMatrixBuffer,
  index: number,
  target: THREE.Matrix4
): THREE.Matrix4 {
  if (matrices === null || matrices === undefined || typeof matrices.length !== "number") {
    throw new TypeError("MMD_WORLD_MATRIX_BUFFER_INVALID");
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`MMD_WORLD_MATRIX_INDEX_INVALID:${index}`);
  }
  const offset = index * 16;
  if (matrices.length < offset + 16) {
    throw new RangeError(`MMD_WORLD_MATRIX_BUFFER_TOO_SHORT:${index}:${matrices.length}`);
  }
  for (let componentIndex = 0; componentIndex < 16; componentIndex++) {
    const component = matrices[offset + componentIndex];
    if (!Number.isFinite(component)) {
      throw new TypeError(`MMD_WORLD_MATRIX_COMPONENT_NON_FINITE:${index}:${componentIndex}`);
    }
  }

  return target.set(
    matrices[offset],
    matrices[offset + 4],
    -matrices[offset + 8],
    matrices[offset + 12],
    matrices[offset + 1],
    matrices[offset + 5],
    -matrices[offset + 9],
    matrices[offset + 13],
    -matrices[offset + 2],
    -matrices[offset + 6],
    matrices[offset + 10],
    -matrices[offset + 14],
    0,
    0,
    0,
    1
  );
}

export function syncThreeMmdRuntimeToMesh(
  model: Pick<MmdModel, "skeleton">,
  mesh: THREE.SkinnedMesh,
  runtime: MmdRuntimeMeshSyncSource,
  outlineMeshes?: readonly THREE.SkinnedMesh[],
  renderOrderMeshes?: readonly THREE.SkinnedMesh[]
): void {
  syncThreeMmdRuntimeToMeshInternal(model, mesh, runtime, outlineMeshes, renderOrderMeshes);
}

export function syncThreeMmdRuntimeToModel(
  model: Pick<MmdModel, "skeleton">,
  target: ThreeMmdRuntimeSyncTarget,
  runtime: MmdRuntimeMeshSyncSource
): void {
  syncThreeMmdRuntimeToMeshInternal(
    model,
    target.mesh,
    runtime,
    target.outlineMeshes,
    target.renderOrderMeshes
  );
}

function syncThreeMmdRuntimeToMeshInternal(
  model: Pick<MmdModel, "skeleton">,
  mesh: THREE.SkinnedMesh,
  runtime: MmdRuntimeMeshSyncSource,
  outlineMeshes: readonly THREE.SkinnedMesh[] | undefined,
  renderOrderMeshes: readonly THREE.SkinnedMesh[] | undefined
): void {
  syncRuntimeBoneTransforms(model, mesh, runtime.boneMatrices());
  syncRuntimeMorphWeights(mesh, runtime.morphWeights());
  syncMorphSplitTargetInfluences(mesh);
  const visible = runtime.propertyState().visible;
  mesh.visible = visible;
  const materialStates = runtime.materialStates();
  syncMmdMaterialStates(mesh.material, materialStates);
  if (renderOrderMeshes) {
    for (let index = 0; index < renderOrderMeshes.length; index += 1) {
      const renderOrderMesh = renderOrderMeshes[index];
      renderOrderMesh.visible = visible;
      syncRenderOrderProxyMaterialState(renderOrderMesh, materialStates, index);
    }
  }
  if (outlineMeshes) {
    for (let index = 0; index < outlineMeshes.length; index += 1) {
      const outlineMesh = outlineMeshes[index];
      outlineMesh.visible = visible;
      syncMmdOutlineMaterialStates(outlineMesh.material, materialStates);
    }
    return;
  }
  for (let index = 0; index < mesh.children.length; index += 1) {
    const child = mesh.children[index];
    if (child instanceof THREE.SkinnedMesh && child.userData.mmdOutlineProxy) {
      child.visible = visible;
      syncMmdOutlineMaterialStates(child.material, materialStates);
    }
  }
}

function syncRenderOrderProxyMaterialState(
  mesh: THREE.SkinnedMesh,
  materialStates: readonly MaterialRuntimeState[],
  fallbackIndex: number
): void {
  const metadata = mesh.userData.mmdMaterialRenderProxy as
    | { readonly materialIndex?: number }
    | undefined;
  const materialIndex = metadata?.materialIndex ?? fallbackIndex;
  const state = materialStates[materialIndex];
  if (!state || Array.isArray(mesh.material) || !mesh.material.userData.mmdShadowOnlyRenderProxy) {
    return;
  }
  const material = mesh.material;
  material.opacity = clampColor(state.diffuse[3]);
  const flags = material.userData.mmdMaterial?.flags;
  const suppressColor = mmdMaterialSuppressesColorAtAlpha(material.opacity, flags);
  const transparencyMode = material.userData.mmdMaterial?.transparencyMode;
  material.visible = material.opacity > 0 || suppressColor;
  material.transparent = transparencyMode === "alphaBlend" || material.opacity < 1;
  material.colorWrite = false;
  material.depthWrite = false;
  material.needsUpdate = true;
}

function syncRuntimeMorphWeights(mesh: THREE.SkinnedMesh, weights: Float32Array): void {
  if (!mesh.morphTargetInfluences) {
    return;
  }
  mesh.morphTargetInfluences.forEach((_value, index, influences) => {
    influences[index] = weights[index] ?? 0;
  });
}

function syncRuntimeBoneTransforms(
  model: Pick<MmdModel, "skeleton">,
  mesh: THREE.SkinnedMesh,
  coreMatrices: Float32Array
): void {
  const bones = mesh.skeleton.bones;
  const worldMatrices = ensureScratchMatrixArrayLength(scratchWorldMatrices, bones.length);
  for (let index = 0; index < bones.length; index += 1) {
    writeMmdWorldMatrixToThree(coreMatrices, index, worldMatrices[index]);
  }
  for (let index = 0; index < bones.length; index += 1) {
    const bone = bones[index];
    const parentIndex = model.skeleton().bones[index]?.parentIndex ?? -1;
    const localMatrix =
      parentIndex >= 0
        ? scratchLocalMatrix.copy(worldMatrices[parentIndex]).invert().multiply(worldMatrices[index])
        : worldMatrices[index];
    localMatrix.decompose(bone.position, bone.quaternion, bone.scale);
    bone.updateMatrix();
  }
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  if (mesh.skeleton.boneTexture) {
    mesh.skeleton.boneTexture.needsUpdate = true;
  }
}

function ensureScratchMatrixArrayLength(
  matrices: THREE.Matrix4[],
  length: number
): THREE.Matrix4[] {
  for (let index = matrices.length; index < length; index += 1) {
    matrices.push(new THREE.Matrix4());
  }
  matrices.length = length;
  return matrices;
}
