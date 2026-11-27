import type { MutableQuatTuple, QuatTuple, Vec3Tuple } from "./CcdIkSolver.js";

export type MutableVec3Tuple = [number, number, number];

export type Rotation3Tuple = [
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

export function copyQuaternionInto(
  source: readonly [number, number, number, number],
  target: [number, number, number, number]
): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
  target[3] = source[3];
}

export function applyEffectiveRotation(
  rotations: MutableQuatTuple[],
  baseRotations: readonly [number, number, number, number][],
  ikRotations: readonly [number, number, number, number][],
  boneIndex: number
): void {
  multiplyQuaternionsInto(ikRotations[boneIndex], baseRotations[boneIndex], rotations[boneIndex]);
}

export function subtractVectors(
  left: [number, number, number],
  right: [number, number, number]
): [number, number, number] {
  return subtractVectorsInto(left, right, [0, 0, 0]);
}

export function subtractVectorsInto(
  left: [number, number, number],
  right: [number, number, number],
  target: [number, number, number]
): [number, number, number] {
  target[0] = left[0] - right[0];
  target[1] = left[1] - right[1];
  target[2] = left[2] - right[2];
  return target;
}

export function crossVectorsInto(
  left: [number, number, number],
  right: [number, number, number],
  target: [number, number, number]
): [number, number, number] {
  const leftX = left[0];
  const leftY = left[1];
  const leftZ = left[2];
  const rightX = right[0];
  const rightY = right[1];
  const rightZ = right[2];
  target[0] = leftY * rightZ - leftZ * rightY;
  target[1] = leftZ * rightX - leftX * rightZ;
  target[2] = leftX * rightY - leftY * rightX;
  return target;
}

export function dotVectors(left: [number, number, number], right: [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function normalizeVectorInto(
  value: [number, number, number],
  target: [number, number, number]
): [number, number, number] {
  const x = value[0];
  const y = value[1];
  const z = value[2];
  const length = vectorLength(value);
  if (length < 1e-8) {
    target[0] = 0;
    target[1] = 0;
    target[2] = 0;
    return target;
  }
  target[0] = x / length;
  target[1] = y / length;
  target[2] = z / length;
  return target;
}

export function signedProjectedAngleInto(
  from: [number, number, number],
  to: [number, number, number],
  axisValue: Vec3Tuple,
  axis: MutableVec3Tuple,
  projectedFrom: MutableVec3Tuple,
  projectedTo: MutableVec3Tuple,
  rotated: MutableVec3Tuple,
  quaternionScratch: MutableQuatTuple
): number {
  axis[0] = axisValue[0];
  axis[1] = axisValue[1];
  axis[2] = axisValue[2];
  normalizeVectorInto(axis, axis);
  normalizeVectorInto(projectVectorOnPlaneInto(from, axis, projectedFrom), projectedFrom);
  normalizeVectorInto(projectVectorOnPlaneInto(to, axis, projectedTo), projectedTo);
  if (vectorLength(projectedFrom) < 1e-5 || vectorLength(projectedTo) < 1e-5) {
    return 0;
  }
  const angle = Math.acos(clamp(dotVectors(projectedFrom, projectedTo), -1, 1));
  const positiveDot = dotVectors(
    rotateVectorByQuaternionInto(
      projectedFrom,
      axisAngleQuaternionInto(axis, angle, quaternionScratch),
      rotated
    ),
    projectedTo
  );
  const negativeDot = dotVectors(
    rotateVectorByQuaternionInto(
      projectedFrom,
      axisAngleQuaternionInto(axis, -angle, quaternionScratch),
      rotated
    ),
    projectedTo
  );
  return positiveDot >= negativeDot ? angle : -angle;
}

function projectVectorOnPlaneInto(
  vector: [number, number, number],
  normal: [number, number, number],
  target: MutableVec3Tuple
): MutableVec3Tuple {
  const scale = dotVectors(vector, normal);
  target[0] = vector[0] - normal[0] * scale;
  target[1] = vector[1] - normal[1] * scale;
  target[2] = vector[2] - normal[2] * scale;
  return target;
}

export function stablePerpendicularAxisInto(
  vector: [number, number, number],
  target: [number, number, number]
): [number, number, number] {
  const basisX = Math.abs(vector[0]) < 0.9 ? 1 : 0;
  const basisY = basisX === 1 ? 0 : 1;
  const x = vector[0];
  const y = vector[1];
  const z = vector[2];
  target[0] = -z * basisY;
  target[1] = z * basisX;
  target[2] = x * basisY - y * basisX;
  return normalizeVectorInto(target, target);
}

export function vectorLength(value: [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function axisAngleQuaternionInto(
  axis: [number, number, number],
  angle: number,
  target: MutableQuatTuple
): MutableQuatTuple {
  const half = angle / 2;
  const scale = Math.sin(half);
  target[0] = axis[0] * scale;
  target[1] = axis[1] * scale;
  target[2] = axis[2] * scale;
  target[3] = Math.cos(half);
  return normalizeQuaternionInto(target, target);
}

export function multiplyQuaternionsInto(
  left: QuatTuple,
  right: QuatTuple,
  target: MutableQuatTuple
): MutableQuatTuple {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  target[0] = aw * bx + ax * bw + ay * bz - az * by;
  target[1] = aw * by - ax * bz + ay * bw + az * bx;
  target[2] = aw * bz + ax * by - ay * bx + az * bw;
  target[3] = aw * bw - ax * bx - ay * by - az * bz;
  return normalizeQuaternionInto(target, target);
}

export function normalizeQuaternionInto(value: QuatTuple, target: MutableQuatTuple): MutableQuatTuple {
  const length = Math.hypot(value[0], value[1], value[2], value[3]) || 1;
  target[0] = value[0] / length;
  target[1] = value[1] / length;
  target[2] = value[2] / length;
  target[3] = value[3] / length;
  return target;
}

export function invertQuaternionInto(value: QuatTuple, target: MutableQuatTuple): MutableQuatTuple {
  normalizeQuaternionInto(value, target);
  target[0] *= -1;
  target[1] *= -1;
  target[2] *= -1;
  return target;
}

export function rotateVectorByQuaternionInto(
  vector: [number, number, number],
  rotation: QuatTuple,
  target: MutableVec3Tuple
): MutableVec3Tuple {
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]) || 1;
  const x = rotation[0] / length;
  const y = rotation[1] / length;
  const z = rotation[2] / length;
  const w = rotation[3] / length;
  const vectorX = vector[0];
  const vectorY = vector[1];
  const vectorZ = vector[2];
  const tx = 2 * (y * vectorZ - z * vectorY);
  const ty = 2 * (z * vectorX - x * vectorZ);
  const tz = 2 * (x * vectorY - y * vectorX);
  target[0] = vectorX + w * tx + (y * tz - z * ty);
  target[1] = vectorY + w * ty + (z * tx - x * tz);
  target[2] = vectorZ + w * tz + (x * ty - y * tx);
  return target;
}

export function quaternionToRotation3Into(rotation: QuatTuple, target: Rotation3Tuple): Rotation3Tuple {
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]) || 1;
  const x = rotation[0] / length;
  const y = rotation[1] / length;
  const z = rotation[2] / length;
  const w = rotation[3] / length;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  target[0] = 1 - (yy + zz);
  target[1] = xy + wz;
  target[2] = xz - wy;
  target[3] = xy - wz;
  target[4] = 1 - (xx + zz);
  target[5] = yz + wx;
  target[6] = xz + wy;
  target[7] = yz - wx;
  target[8] = 1 - (xx + yy);
  return target;
}

export function decomposeEulerXyzInto(
  matrix: Rotation3Tuple,
  before: [number, number, number],
  target: MutableVec3Tuple,
  candidate: MutableVec3Tuple
): MutableVec3Tuple {
  const sy = -matrix[2];
  if (1 - Math.abs(sy) < 1e-6) {
    const y = Math.asin(sy);
    const sx = Math.sin(before[0]);
    const sz = Math.sin(before[2]);
    if (Math.abs(sx) < Math.abs(sz)) {
      const cx = Math.cos(before[0]);
      target[0] = cx > 0 ? 0 : Math.PI;
      target[1] = y;
      target[2] = cx > 0 ? Math.asin(-matrix[3]) : Math.asin(matrix[3]);
    } else {
      const cz = Math.cos(before[2]);
      target[0] = cz > 0 ? Math.asin(-matrix[7]) : Math.asin(matrix[7]);
      target[1] = y;
      target[2] = cz > 0 ? 0 : Math.PI;
    }
  } else {
    target[0] = Math.atan2(matrix[5], matrix[8]);
    target[1] = Math.asin(-matrix[2]);
    target[2] = Math.atan2(matrix[1], matrix[0]);
  }
  const pi = Math.PI;
  let minError =
    Math.abs(diffAngle(target[0], before[0])) +
    Math.abs(diffAngle(target[1], before[1])) +
    Math.abs(diffAngle(target[2], before[2]));
  const baseX = target[0];
  const baseY = target[1];
  const baseZ = target[2];
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX + pi, pi - baseY, baseZ + pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX + pi, pi - baseY, baseZ - pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX + pi, -pi - baseY, baseZ + pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX + pi, -pi - baseY, baseZ - pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX - pi, pi - baseY, baseZ + pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX - pi, pi - baseY, baseZ - pi);
  minError = chooseEulerCandidate(target, before, candidate, minError, baseX - pi, -pi - baseY, baseZ + pi);
  chooseEulerCandidate(target, before, candidate, minError, baseX - pi, -pi - baseY, baseZ - pi);
  return target;
}

function chooseEulerCandidate(
  target: MutableVec3Tuple,
  before: [number, number, number],
  candidate: MutableVec3Tuple,
  minError: number,
  x: number,
  y: number,
  z: number
): number {
  candidate[0] = x;
  candidate[1] = y;
  candidate[2] = z;
  const error =
    Math.abs(diffAngle(candidate[0], before[0])) +
    Math.abs(diffAngle(candidate[1], before[1])) +
    Math.abs(diffAngle(candidate[2], before[2]));
  if (error >= minError) {
    return minError;
  }
  target[0] = candidate[0];
  target[1] = candidate[1];
  target[2] = candidate[2];
  return error;
}

function diffAngle(a: number, b: number): number {
  const diff = normalizeAngle(a) - normalizeAngle(b);
  if (diff > Math.PI) {
    return diff - Math.PI * 2;
  }
  if (diff < -Math.PI) {
    return diff + Math.PI * 2;
  }
  return diff;
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result >= Math.PI * 2) {
    result -= Math.PI * 2;
  }
  while (result < 0) {
    result += Math.PI * 2;
  }
  return result;
}

export function eulerXyzToQuaternionInto(
  euler: [number, number, number],
  target: MutableQuatTuple
): MutableQuatTuple {
  const [x, y, z] = euler;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  target[0] = s1 * c2 * c3 + c1 * s2 * s3;
  target[1] = c1 * s2 * c3 - s1 * c2 * s3;
  target[2] = c1 * c2 * s3 + s1 * s2 * c3;
  target[3] = c1 * c2 * c3 - s1 * s2 * s3;
  return normalizeQuaternionInto(target, target);
}
