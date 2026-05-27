import type * as THREE from "three";

export interface MmdBoneRuntimeUserData {
  readonly mmdBoneName?: unknown;
  readonly mmdEnglishBoneName?: unknown;
  readonly mmdEnglishName?: unknown;
  readonly mmdFlags?: unknown;
  readonly mmdIkStateName?: unknown;
}

export interface MmdMeshRuntimeUserData {
  readonly mmdIkChains?: unknown;
  readonly mmdMorphs?: unknown;
  readonly mmdPhysics?: unknown;
}

export function readMmdBoneUserData(bone: THREE.Bone): MmdBoneRuntimeUserData {
  return bone.userData as MmdBoneRuntimeUserData;
}

export function readMmdMeshRuntimeData(mesh: THREE.SkinnedMesh): MmdMeshRuntimeUserData {
  return mesh.userData as MmdMeshRuntimeUserData;
}
