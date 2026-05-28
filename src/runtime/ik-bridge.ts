import * as THREE from "three";
import type { CcdIkBone, CcdIkPreparedChain, CcdIkSolver, MutableQuatTuple } from "./ik/index.js";
import { readMmdMeshRuntimeData } from "./userData.js";
type RuntimeIkChain = Parameters<CcdIkSolver["solve"]>[0]["chains"][number];
interface MutableCcdIkBone {
  parentIndex: number;
  translation: [number, number, number];
}

export interface SolvePreparedIkScratch {
  readonly bones: MutableCcdIkBone[];
  readonly rotations: MutableQuatTuple[];
  readonly sourceBoneIndices: Set<number>;
}

function readIkChains(mesh: THREE.SkinnedMesh): RuntimeIkChain[] {
  const chains = readMmdMeshRuntimeData(mesh).mmdIkChains;
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
  collectIkSourceBoneIndicesInto(chains, indices);
  return indices;
}

function collectIkSourceBoneIndicesInto(
  chains: readonly RuntimeIkChain[],
  indices: Set<number>
): Set<number> {
  indices.clear();
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

export function solvePreparedIk(
  mesh: THREE.SkinnedMesh | undefined,
  solver: CcdIkSolver,
  chains: readonly CcdIkPreparedChain[],
  scratch: SolvePreparedIkScratch
): Set<number> {
  if (!mesh || chains.length === 0) {
    scratch.sourceBoneIndices.clear();
    return scratch.sourceBoneIndices;
  }
  mesh.updateWorldMatrix(false, true);
  const skeletonBones = mesh.skeleton.bones;
  ensureIkScratchLength(scratch, skeletonBones.length);
  for (let index = 0; index < skeletonBones.length; index += 1) {
    const bone = skeletonBones[index];
    const scratchBone = scratch.bones[index];
    scratchBone.parentIndex =
      bone.parent instanceof THREE.Bone ? skeletonBones.indexOf(bone.parent) : -1;
    scratchBone.translation[0] = bone.position.x;
    scratchBone.translation[1] = bone.position.y;
    scratchBone.translation[2] = -bone.position.z;
    const rotation = scratch.rotations[index];
    rotation[0] = -bone.quaternion.x;
    rotation[1] = -bone.quaternion.y;
    rotation[2] = bone.quaternion.z;
    rotation[3] = bone.quaternion.w;
  }
  solver.solvePrepared({
    bones: scratch.bones as readonly CcdIkBone[],
    pose: { rotations: scratch.rotations },
    chains
  });
  for (let index = 0; index < skeletonBones.length; index += 1) {
    const rotation = scratch.rotations[index];
    skeletonBones[index]?.quaternion.set(-rotation[0], -rotation[1], rotation[2], rotation[3]);
  }
  return collectIkSourceBoneIndicesInto(chains, scratch.sourceBoneIndices);
}

function ensureIkScratchLength(scratch: SolvePreparedIkScratch, length: number): void {
  for (let index = scratch.bones.length; index < length; index += 1) {
    scratch.bones.push({
      parentIndex: -1,
      translation: [0, 0, 0]
    });
  }
  for (let index = scratch.rotations.length; index < length; index += 1) {
    scratch.rotations.push([0, 0, 0, 1]);
  }
  scratch.bones.length = length;
  scratch.rotations.length = length;
}
export { collectIkSourceBoneIndices, createCcdIkStaticBones, readIkChains };
