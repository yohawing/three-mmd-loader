import type { CcdIkBone, CcdIkChain, CcdIkPose, QuatTuple, Vec3Tuple } from "./CcdIkSolver.js";

export function validateSkeleton(bones: readonly CcdIkBone[]): void {
  for (const [index, bone] of bones.entries()) {
    if (!Number.isInteger(bone.parentIndex) || bone.parentIndex < -1) {
      throw new RangeError("CCD IK bone parentIndex must be -1 or a valid bone index");
    }
    if (bone.parentIndex === index) {
      throw new RangeError("CCD IK bone cannot parent itself");
    }
    if (bone.parentIndex >= bones.length) {
      throw new RangeError("CCD IK bone parentIndex is out of range");
    }
  }
  for (let index = 0; index < bones.length; index += 1) {
    assertAcyclicParentChain(bones, index);
  }
}

export function validatePose(pose: CcdIkPose, boneCount: number): void {
  if (pose.rotations.length !== boneCount) {
    throw new RangeError("CCD IK pose rotation count must match bone count");
  }
  for (const rotation of pose.rotations) {
    assertFiniteQuaternion(rotation, "pose rotation");
  }
}

export function assertFiniteBoneTranslations(bones: readonly CcdIkBone[]): void {
  for (const bone of bones) {
    assertFiniteVector(bone.translation, "bone translation");
  }
}

export function validateChain(chain: CcdIkChain, bones: readonly CcdIkBone[]): void {
  assertBoneIndex(bones, chain.goalBoneIndex, "goalBoneIndex");
  assertBoneIndex(bones, chain.effectorBoneIndex, "effectorBoneIndex");
  if (!Number.isFinite(chain.iterationCount) || chain.iterationCount < 0) {
    throw new RangeError("CCD IK iterationCount must be a finite non-negative number");
  }
  if (chain.maxAnglePerIteration !== undefined && !Number.isFinite(chain.maxAnglePerIteration)) {
    throw new RangeError("CCD IK maxAnglePerIteration must be finite when provided");
  }
  if (
    chain.tolerance !== undefined &&
    (!Number.isFinite(chain.tolerance) || chain.tolerance < 0)
  ) {
    throw new RangeError("CCD IK tolerance must be a finite non-negative number");
  }
  for (const link of chain.links) {
    assertBoneIndex(bones, link.boneIndex, "link boneIndex");
    if (link.angleLimit !== undefined) {
      assertFiniteVector(link.angleLimit.minimumAngle, "link minimumAngle");
      assertFiniteVector(link.angleLimit.maximumAngle, "link maximumAngle");
      for (let axis = 0; axis < 3; axis += 1) {
        if (link.angleLimit.minimumAngle[axis] > link.angleLimit.maximumAngle[axis]) {
          throw new RangeError("CCD IK link angle limit minimum must not exceed maximum");
        }
      }
    }
    if (
      link.limitsKind !== undefined &&
      link.limitsKind !== "pmdKnee" &&
      link.limitsKind !== "pmxLinkLimit"
    ) {
      throw new RangeError("CCD IK link limitsKind must be pmdKnee or pmxLinkLimit");
    }
    if (link.fixedAxis !== undefined) {
      assertFiniteVector(link.fixedAxis, "link fixedAxis");
    }
    if (link.localAxisBasis !== undefined) {
      assertFiniteQuaternion(link.localAxisBasis, "link localAxisBasis");
    }
  }
}

function assertAcyclicParentChain(bones: readonly CcdIkBone[], boneIndex: number): void {
  const visited = new Set<number>();
  let currentIndex = boneIndex;
  while (currentIndex >= 0) {
    if (visited.has(currentIndex)) {
      throw new RangeError("CCD IK bone parent chain must not contain cycles");
    }
    visited.add(currentIndex);
    currentIndex = bones[currentIndex]?.parentIndex ?? -1;
  }
}

function assertBoneIndex(bones: readonly CcdIkBone[], index: number, name: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= bones.length) {
    throw new RangeError(`CCD IK ${name} is out of range`);
  }
}

function assertFiniteVector(vector: Vec3Tuple, name: string): void {
  if (!vector.every(Number.isFinite)) {
    throw new RangeError(`CCD IK ${name} must be finite`);
  }
}

function assertFiniteQuaternion(rotation: QuatTuple, name: string): void {
  if (!rotation.every(Number.isFinite)) {
    throw new RangeError(`CCD IK ${name} must be finite`);
  }
}
