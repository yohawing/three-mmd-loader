import type { CcdIkLink, MutableQuatTuple, QuatTuple, Vec3Tuple } from "./CcdIkSolver.js";
import {
  type MutableVec3Tuple,
  type Rotation3Tuple,
  clamp,
  copyQuaternionInto,
  decomposeEulerXyzInto,
  eulerXyzToQuaternionInto,
  invertQuaternionInto,
  multiplyQuaternionsInto,
  normalizeQuaternionInto,
  quaternionToRotation3Into
} from "./math.js";
import type { IkChainState } from "./chainSolve.js";

export type LinkLimits = {
  readonly lower: [number, number, number];
  readonly upper: [number, number, number];
};

export function toLinkLimitsInto(
  limit: CcdIkLink["angleLimit"],
  target: LinkLimits
): LinkLimits | undefined {
  if (!limit) {
    target.lower[0] = 0;
    target.lower[1] = 0;
    target.lower[2] = 0;
    target.upper[0] = 0;
    target.upper[1] = 0;
    target.upper[2] = 0;
    return undefined;
  }
  target.lower[0] = limit.minimumAngle[0];
  target.lower[1] = limit.minimumAngle[1];
  target.lower[2] = limit.minimumAngle[2];
  target.upper[0] = limit.maximumAngle[0];
  target.upper[1] = limit.maximumAngle[1];
  target.upper[2] = limit.maximumAngle[2];
  return target;
}

export function getSingleAxisLimit(limits: LinkLimits | undefined): number | null {
  if (!limits) {
    return null;
  }
  const x = limits.lower[0] !== 0 || limits.upper[0] !== 0;
  const y = limits.lower[1] !== 0 || limits.upper[1] !== 0;
  const z = limits.lower[2] !== 0 || limits.upper[2] !== 0;
  if (x && hasZeroEndpointAxisLimit(limits, 1) && hasZeroEndpointAxisLimit(limits, 2)) {
    return 0;
  }
  if (y && hasZeroEndpointAxisLimit(limits, 0) && hasZeroEndpointAxisLimit(limits, 2)) {
    return 1;
  }
  if (z && hasZeroEndpointAxisLimit(limits, 0) && hasZeroEndpointAxisLimit(limits, 1)) {
    return 2;
  }
  return null;
}

function hasZeroEndpointAxisLimit(limits: LinkLimits, axis: number): boolean {
  return limits.lower[axis] === 0 && limits.upper[axis] === 0;
}

export function clampLimitedRotationInto(
  rotation: [number, number, number, number],
  limits: LinkLimits,
  state: IkChainState,
  limitAngle: number,
  localAxisBasis: QuatTuple | undefined,
  rotation3Scratch: Rotation3Tuple,
  eulerScratch: MutableVec3Tuple[],
  quaternionScratch: MutableQuatTuple[],
  target: MutableQuatTuple
): [number, number, number, number] {
  const localAxisInverse = localAxisBasis
    ? invertQuaternionInto(localAxisBasis, quaternionScratch[0])
    : undefined;
  const localRotation =
    localAxisBasis && localAxisInverse
      ? multiplyQuaternionsInto(
          multiplyQuaternionsInto(localAxisInverse, rotation, quaternionScratch[1]),
          localAxisBasis,
          quaternionScratch[1]
        )
      : rotation;
  const euler = decomposeEulerXyzInto(
    quaternionToRotation3Into(localRotation, rotation3Scratch),
    state.previousAngle,
    eulerScratch[0],
    eulerScratch[1]
  );
  const clampedEuler = eulerScratch[1];
  clampedEuler[0] = clamp(euler[0], limits.lower[0], limits.upper[0]);
  clampedEuler[1] = clamp(euler[1], limits.lower[1], limits.upper[1]);
  clampedEuler[2] = clamp(euler[2], limits.lower[2], limits.upper[2]);
  const limitedStep = eulerScratch[2];
  limitedStep[0] =
    clamp(clampedEuler[0] - state.previousAngle[0], -limitAngle, limitAngle) +
    state.previousAngle[0];
  limitedStep[1] =
    clamp(clampedEuler[1] - state.previousAngle[1], -limitAngle, limitAngle) +
    state.previousAngle[1];
  limitedStep[2] =
    clamp(clampedEuler[2] - state.previousAngle[2], -limitAngle, limitAngle) +
    state.previousAngle[2];
  state.previousAngle[0] = limitedStep[0];
  state.previousAngle[1] = limitedStep[1];
  state.previousAngle[2] = limitedStep[2];
  const localClampedRotation = eulerXyzToQuaternionInto(limitedStep, target);
  return localAxisBasis && localAxisInverse
    ? multiplyQuaternionsInto(
        multiplyQuaternionsInto(localAxisBasis, localClampedRotation, quaternionScratch[1]),
        localAxisInverse,
        target
      )
    : localClampedRotation;
}

export function projectQuaternionOntoAxisInto(
  rotation: QuatTuple,
  axis: Vec3Tuple,
  target: MutableQuatTuple
): MutableQuatTuple {
  const axisLength = Math.hypot(axis[0], axis[1], axis[2]);
  if (!Number.isFinite(axisLength) || axisLength < 1e-12) {
    copyQuaternionInto(rotation, target);
    return target;
  }
  const axisX = axis[0] / axisLength;
  const axisY = axis[1] / axisLength;
  const axisZ = axis[2] / axisLength;
  const projection = rotation[0] * axisX + rotation[1] * axisY + rotation[2] * axisZ;
  target[0] = axisX * projection;
  target[1] = axisY * projection;
  target[2] = axisZ * projection;
  target[3] = rotation[3];
  return normalizeQuaternionInto(target, target);
}

export function usableFixedAxis(axis: Vec3Tuple | undefined): Vec3Tuple | undefined {
  if (!axis || !axis.every(Number.isFinite) || Math.hypot(axis[0], axis[1], axis[2]) < 1e-12) {
    return undefined;
  }
  return axis;
}

export function rotationIsWithinLimits(
  ikRotation: QuatTuple,
  baseRotation: QuatTuple,
  limits: LinkLimits,
  localAxisBasis: QuatTuple | undefined,
  rotation3Scratch: Rotation3Tuple,
  eulerScratch: MutableVec3Tuple[],
  quaternionScratch: MutableQuatTuple[]
): boolean {
  const chainRotation = multiplyQuaternionsInto(ikRotation, baseRotation, quaternionScratch[0]);
  const localAxisInverse = localAxisBasis
    ? invertQuaternionInto(localAxisBasis, quaternionScratch[1])
    : undefined;
  const localRotation =
    localAxisBasis && localAxisInverse
      ? multiplyQuaternionsInto(
          multiplyQuaternionsInto(localAxisInverse, chainRotation, quaternionScratch[2]),
          localAxisBasis,
          quaternionScratch[2]
        )
      : chainRotation;
  const preferredEuler = eulerScratch[0];
  preferredEuler[0] = 0;
  preferredEuler[1] = 0;
  preferredEuler[2] = 0;
  const euler = decomposeEulerXyzInto(
    quaternionToRotation3Into(localRotation, rotation3Scratch),
    preferredEuler,
    eulerScratch[1],
    eulerScratch[2]
  );
  return (
    euler[0] >= limits.lower[0] - 1e-5 &&
    euler[0] <= limits.upper[0] + 1e-5 &&
    euler[1] >= limits.lower[1] - 1e-5 &&
    euler[1] <= limits.upper[1] + 1e-5 &&
    euler[2] >= limits.lower[2] - 1e-5 &&
    euler[2] <= limits.upper[2] + 1e-5
  );
}
