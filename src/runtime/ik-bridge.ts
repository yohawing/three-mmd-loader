import * as THREE from "three";
import type { CcdIkBone, CcdIkPreparedChain, CcdIkSolver } from "./ik/index.js";
import { mmdQuaternionToThree, threeQuaternionToMmd } from "./math.js";
type RuntimeIkChain = Parameters<CcdIkSolver["solve"]>[0]["chains"][number];
function readIkChains(mesh: THREE.SkinnedMesh): RuntimeIkChain[] {
  const chains = mesh.userData.mmdIkChains;
  return Array.isArray(chains) ? chains.filter(isRuntimeIkChain) : [];
}

function createCcdIkStaticBones(mesh: THREE.SkinnedMesh): CcdIkBone[] {
  return mesh.skeleton.bones.map((bone) => ({
    parentIndex:
      bone.parent instanceof THREE.Bone ? mesh.skeleton.bones.indexOf(bone.parent) : -1,
    translation: [0, 0, 0] as const
  }));
}

function collectIkSourceBoneIndices(chains: readonly RuntimeIkChain[]): Set<number> {
  const indices = new Set<number>();
  for (const chain of chains) {
    indices.add(chain.goalBoneIndex);
    indices.add(chain.effectorBoneIndex);
    for (const link of chain.links) {
      indices.add(link.boneIndex);
    }
  }
  return indices;
}

function isRuntimeIkChain(value: unknown): value is RuntimeIkChain {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const chain = value as {
    readonly goalBoneIndex?: unknown;
    readonly effectorBoneIndex?: unknown;
    readonly links?: unknown;
    readonly iterationCount?: unknown;
  };
  return (
    Number.isInteger(chain.goalBoneIndex) &&
    Number.isInteger(chain.effectorBoneIndex) &&
    Number.isFinite(chain.iterationCount) &&
    Array.isArray(chain.links)
  );
}

export function solvePreparedIk(mesh: THREE.SkinnedMesh | undefined, solver: CcdIkSolver, chains: readonly CcdIkPreparedChain[]): Set<number> { if (!mesh) return new Set(); if (chains.length === 0) return new Set(); mesh.updateWorldMatrix(false, true); const bones = mesh.skeleton.bones.map((bone) => ({ parentIndex: bone.parent instanceof THREE.Bone ? mesh.skeleton.bones.indexOf(bone.parent) : -1, translation: [bone.position.x, bone.position.y, -bone.position.z] as [number, number, number] })); const rotations = mesh.skeleton.bones.map((bone) => threeQuaternionToMmd(bone.quaternion)); solver.solvePrepared({ bones, pose: { rotations }, chains }); rotations.forEach((rotation, index) => { mesh.skeleton.bones[index]?.quaternion.fromArray(mmdQuaternionToThree(rotation)); }); return collectIkSourceBoneIndices(chains); }
export { collectIkSourceBoneIndices, createCcdIkStaticBones, readIkChains };
