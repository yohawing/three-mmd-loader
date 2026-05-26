import * as THREE from "three";

import type { MaterialRuntimeState, MmdModel } from "../parser/model/modelTypes.js";
import { syncMmdMaterialStates } from "./material/material-sync.js";
import { syncMmdOutlineMaterialStates } from "./outline.js";

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

export function mmdWorldMatrixToThree(matrices: MmdWorldMatrixBuffer, index = 0): THREE.Matrix4 {
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
  const value = (row: number, column: number) => matrices[offset + column * 4 + row];
  const sign = (axis: number) => (axis === 2 ? -1 : 1);

  return new THREE.Matrix4().set(
    sign(0) * value(0, 0) * sign(0),
    sign(0) * value(0, 1) * sign(1),
    sign(0) * value(0, 2) * sign(2),
    sign(0) * value(0, 3),
    sign(1) * value(1, 0) * sign(0),
    sign(1) * value(1, 1) * sign(1),
    sign(1) * value(1, 2) * sign(2),
    sign(1) * value(1, 3),
    sign(2) * value(2, 0) * sign(0),
    sign(2) * value(2, 1) * sign(1),
    sign(2) * value(2, 2) * sign(2),
    sign(2) * value(2, 3),
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
  const visible = runtime.propertyState().visible;
  mesh.visible = visible;
  const materialStates = runtime.materialStates();
  syncMmdMaterialStates(mesh.material, materialStates);
  if (renderOrderMeshes) {
    for (let index = 0; index < renderOrderMeshes.length; index += 1) {
      renderOrderMeshes[index].visible = visible;
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
  const worldMatrices = bones.map((_, index) => mmdWorldMatrixToThree(coreMatrices, index));
  for (let index = 0; index < bones.length; index += 1) {
    const bone = bones[index];
    const parentIndex = model.skeleton().bones[index]?.parentIndex ?? -1;
    const localMatrix =
      parentIndex >= 0
        ? new THREE.Matrix4()
            .copy(worldMatrices[parentIndex])
            .invert()
            .multiply(worldMatrices[index])
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
