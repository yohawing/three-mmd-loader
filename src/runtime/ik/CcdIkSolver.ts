export type Vec3Tuple = readonly [number, number, number];
export type QuatTuple = readonly [number, number, number, number];
export type MutableQuatTuple = [number, number, number, number];

export interface CcdIkBone {
  readonly parentIndex: number;
  readonly translation: Vec3Tuple;
}

export interface CcdIkLink {
  readonly boneIndex: number;
  readonly enabled?: boolean;
  readonly angleLimit?: CcdIkLinkAngleLimit;
  readonly limitsKind?: "pmdKnee" | "pmxLinkLimit";
}

export interface CcdIkLinkAngleLimit {
  readonly minimumAngle: Vec3Tuple;
  readonly maximumAngle: Vec3Tuple;
}

export interface CcdIkChain {
  readonly goalBoneIndex: number;
  readonly effectorBoneIndex: number;
  readonly links: readonly CcdIkLink[];
  readonly iterationCount: number;
  readonly maxAnglePerIteration?: number;
  readonly tolerance?: number;
}

export interface CcdIkPose {
  readonly rotations: MutableQuatTuple[];
}

export interface CcdIkSolveInput {
  readonly bones: readonly CcdIkBone[];
  readonly pose: CcdIkPose;
  readonly chains: readonly CcdIkChain[];
}

export interface CcdIkSolveResult {
  readonly chainCount: number;
  readonly iterationCount: number;
  readonly finalDistances: readonly number[];
}

interface WorldBoneState {
  position: [number, number, number];
  rotation: [number, number, number, number];
}

const IDENTITY_QUATERNION: MutableQuatTuple = [0, 0, 0, 1];
const DEFAULT_TOLERANCE = 1e-5;
const MIN_ROTATION_ANGLE = 1e-8;

export class CcdIkSolver {
  solve(input: CcdIkSolveInput): CcdIkSolveResult {
    validateInput(input);

    const worldState = createWorldState(input.bones.length);
    const finalDistances: number[] = [];
    let totalIterations = 0;

    for (const chain of input.chains) {
      const iterationLimit = Math.max(0, Math.trunc(chain.iterationCount));
      const tolerance = chain.tolerance ?? DEFAULT_TOLERANCE;
      let distance = Number.POSITIVE_INFINITY;

      for (let iteration = 0; iteration < iterationLimit; iteration++) {
        composeWorldState(input.bones, input.pose.rotations, worldState);

        distance = distanceBetween(
          worldState[chain.effectorBoneIndex].position,
          worldState[chain.goalBoneIndex].position
        );
        if (distance <= tolerance) {
          break;
        }

        for (const link of chain.links) {
          if (link.enabled === false || link.boneIndex === chain.effectorBoneIndex) {
            continue;
          }

          const linkWorld = worldState[link.boneIndex];
          const effectorVector = subtract(
            worldState[chain.effectorBoneIndex].position,
            linkWorld.position
          );
          const goalVector = subtract(worldState[chain.goalBoneIndex].position, linkWorld.position);
          const effectorLength = length(effectorVector);
          const goalLength = length(goalVector);
          if (effectorLength <= DEFAULT_TOLERANCE || goalLength <= DEFAULT_TOLERANCE) {
            continue;
          }

          const from = scale(effectorVector, 1 / effectorLength);
          const to = scale(goalVector, 1 / goalLength);
          const dot = clamp(dotProduct(from, to), -1, 1);
          let angle = Math.acos(dot);
          if (angle <= MIN_ROTATION_ANGLE) {
            continue;
          }

          const maxAngle = chain.maxAnglePerIteration;
          if (maxAngle !== undefined) {
            angle = Math.min(angle, Math.max(0, maxAngle));
          }

          let axis = normalize(crossProduct(from, to));
          if (axis === null) {
            if (dot > -1 + MIN_ROTATION_ANGLE) {
              continue;
            }
            axis = stablePerpendicularAxis(from);
          }

          const deltaWorldRotation = axisAngleQuaternion(axis, angle);
          const newWorldRotation = normalizeQuaternion(
            multiplyQuaternions(deltaWorldRotation, linkWorld.rotation)
          );
          const parentIndex = input.bones[link.boneIndex].parentIndex;
          const parentWorldRotation =
            parentIndex >= 0 ? worldState[parentIndex].rotation : IDENTITY_QUATERNION;
          input.pose.rotations[link.boneIndex] = normalizeQuaternion(
            multiplyQuaternions(invertQuaternion(parentWorldRotation), newWorldRotation)
          );
          if (link.angleLimit !== undefined) {
            input.pose.rotations[link.boneIndex] = clampQuaternionToEulerLimit(
              input.pose.rotations[link.boneIndex],
              link.angleLimit
            );
            if (
              link.limitsKind === "pmxLinkLimit" &&
              !isQuaternionWithinEulerLimit(input.pose.rotations[link.boneIndex], link.angleLimit)
            ) {
              input.pose.rotations[link.boneIndex] = clampQuaternionToEulerLimit(
                input.pose.rotations[link.boneIndex],
                link.angleLimit
              );
            }
          }

          composeWorldState(input.bones, input.pose.rotations, worldState);
        }

        totalIterations++;
      }

      composeWorldState(input.bones, input.pose.rotations, worldState);
      finalDistances.push(
        distanceBetween(
          worldState[chain.effectorBoneIndex].position,
          worldState[chain.goalBoneIndex].position
        )
      );
    }

    return {
      chainCount: input.chains.length,
      iterationCount: totalIterations,
      finalDistances
    };
  }
}

function validateInput(input: CcdIkSolveInput): void {
  for (const [index, bone] of input.bones.entries()) {
    if (bone.parentIndex >= index) {
      throw new RangeError("CCD IK bones must be ordered parents before children");
    }
    assertFiniteVector(bone.translation, "bone translation");
  }
  if (input.pose.rotations.length !== input.bones.length) {
    throw new RangeError("CCD IK pose rotation count must match bone count");
  }
  for (const rotation of input.pose.rotations) {
    assertFiniteQuaternion(rotation, "pose rotation");
  }
  for (const chain of input.chains) {
    assertBoneIndex(input.bones, chain.goalBoneIndex, "goalBoneIndex");
    assertBoneIndex(input.bones, chain.effectorBoneIndex, "effectorBoneIndex");
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
      assertBoneIndex(input.bones, link.boneIndex, "link boneIndex");
      if (link.angleLimit !== undefined) {
        assertFiniteVector(link.angleLimit.minimumAngle, "link minimumAngle");
        assertFiniteVector(link.angleLimit.maximumAngle, "link maximumAngle");
        for (let axis = 0; axis < 3; axis++) {
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
    }
  }
}

function createWorldState(count: number): WorldBoneState[] {
  return Array.from({ length: count }, () => ({
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1]
  }));
}

function composeWorldState(
  bones: readonly CcdIkBone[],
  rotations: readonly QuatTuple[],
  worldState: WorldBoneState[]
): void {
  for (let index = 0; index < bones.length; index++) {
    const bone = bones[index];
    const localRotation = normalizeQuaternion(rotations[index]);
    if (bone.parentIndex < 0) {
      worldState[index].position = [...bone.translation];
      worldState[index].rotation = localRotation;
      continue;
    }

    const parent = worldState[bone.parentIndex];
    worldState[index].position = add(
      parent.position,
      rotateVector(bone.translation, parent.rotation)
    );
    worldState[index].rotation = normalizeQuaternion(
      multiplyQuaternions(parent.rotation, localRotation)
    );
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

function add(a: Vec3Tuple, b: Vec3Tuple): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3Tuple, b: Vec3Tuple): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector: Vec3Tuple, scalar: number): [number, number, number] {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function length(vector: Vec3Tuple): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function distanceBetween(a: Vec3Tuple, b: Vec3Tuple): number {
  return length(subtract(a, b));
}

function dotProduct(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossProduct(a: Vec3Tuple, b: Vec3Tuple): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(vector: Vec3Tuple): [number, number, number] | null {
  const vectorLength = length(vector);
  if (vectorLength <= DEFAULT_TOLERANCE) {
    return null;
  }
  return scale(vector, 1 / vectorLength);
}

function stablePerpendicularAxis(vector: Vec3Tuple): [number, number, number] {
  const basis: Vec3Tuple = Math.abs(vector[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(crossProduct(vector, basis)) ?? [0, 0, 1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function axisAngleQuaternion(axis: Vec3Tuple, angle: number): [number, number, number, number] {
  const halfAngle = angle * 0.5;
  const sin = Math.sin(halfAngle);
  return normalizeQuaternion([axis[0] * sin, axis[1] * sin, axis[2] * sin, Math.cos(halfAngle)]);
}

function multiplyQuaternions(a: QuatTuple, b: QuatTuple): [number, number, number, number] {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function normalizeQuaternion(rotation: QuatTuple): [number, number, number, number] {
  const rotationLength = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]);
  if (rotationLength <= DEFAULT_TOLERANCE) {
    return [0, 0, 0, 1];
  }
  return [
    rotation[0] / rotationLength,
    rotation[1] / rotationLength,
    rotation[2] / rotationLength,
    rotation[3] / rotationLength
  ];
}

function invertQuaternion(rotation: QuatTuple): [number, number, number, number] {
  const normalized = normalizeQuaternion(rotation);
  return [-normalized[0], -normalized[1], -normalized[2], normalized[3]];
}

function rotateVector(vector: Vec3Tuple, rotation: QuatTuple): [number, number, number] {
  const normalized = normalizeQuaternion(rotation);
  const qVector: [number, number, number, number] = [vector[0], vector[1], vector[2], 0];
  const rotated = multiplyQuaternions(
    multiplyQuaternions(normalized, qVector),
    invertQuaternion(normalized)
  );
  return [rotated[0], rotated[1], rotated[2]];
}

function clampQuaternionToEulerLimit(
  rotation: QuatTuple,
  limit: CcdIkLinkAngleLimit
): [number, number, number, number] {
  const euler = quaternionToEulerXyz(rotation);
  return eulerXyzToQuaternion([
    clamp(euler[0], limit.minimumAngle[0], limit.maximumAngle[0]),
    clamp(euler[1], limit.minimumAngle[1], limit.maximumAngle[1]),
    clamp(euler[2], limit.minimumAngle[2], limit.maximumAngle[2])
  ]);
}

function isQuaternionWithinEulerLimit(rotation: QuatTuple, limit: CcdIkLinkAngleLimit): boolean {
  const epsilon = 1e-6;
  const euler = quaternionToEulerXyz(rotation);
  return euler.every((angle, axis) => {
    return (
      angle >= limit.minimumAngle[axis] - epsilon &&
      angle <= limit.maximumAngle[axis] + epsilon
    );
  });
}

function quaternionToEulerXyz(rotation: QuatTuple): [number, number, number] {
  const [x, y, z, w] = normalizeQuaternion(rotation);
  const sinrCosp = 2 * (w * x - y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  const sinp = 2 * (w * y + z * x);
  const pitch =
    Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(clamp(sinp, -1, 1));

  const sinyCosp = 2 * (w * z - x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  return [roll, pitch, yaw];
}

function eulerXyzToQuaternion(euler: Vec3Tuple): [number, number, number, number] {
  const halfX = euler[0] * 0.5;
  const halfY = euler[1] * 0.5;
  const halfZ = euler[2] * 0.5;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);

  return normalizeQuaternion([
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  ]);
}
