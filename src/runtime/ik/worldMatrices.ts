import type { CcdIkBone, QuatTuple } from "./CcdIkSolver.js";

export const matrixElementCount = 16;

export function composeWorldMatrices(
  bones: readonly CcdIkBone[],
  translations: readonly [number, number, number][],
  rotations: readonly QuatTuple[],
  matrices: Float32Array,
  local: Float32Array,
  states: Uint8Array
): void {
  if (isParentBeforeChildOrdered(bones)) {
    for (let index = 0; index < bones.length; index += 1) {
      composeWorldMatrixInOrder(index, bones, translations, rotations, matrices, local);
    }
    return;
  }
  states.fill(0, 0, bones.length);
  for (let index = 0; index < bones.length; index += 1) {
    composeWorldMatrix(index, bones, translations, rotations, matrices, states, local);
  }
}

function isParentBeforeChildOrdered(bones: readonly CcdIkBone[]): boolean {
  for (let index = 0; index < bones.length; index += 1) {
    const parentIndex = bones[index]?.parentIndex ?? -1;
    if (parentIndex >= index) {
      return false;
    }
  }
  return true;
}

function composeWorldMatrixInOrder(
  index: number,
  bones: readonly CcdIkBone[],
  translations: readonly [number, number, number][],
  rotations: readonly QuatTuple[],
  matrices: Float32Array,
  local: Float32Array
): void {
  composeColumnMajorMatrixInto(
    translations[index] ?? [0, 0, 0],
    rotations[index] ?? [0, 0, 0, 1],
    local
  );
  const targetOffset = index * matrixElementCount;
  const parentIndex = bones[index]?.parentIndex ?? -1;
  if (parentIndex >= 0) {
    multiplyColumnMajorMatricesInto(
      matrices,
      parentIndex * matrixElementCount,
      local,
      0,
      matrices,
      targetOffset
    );
  } else {
    setMatrix(matrices, targetOffset, local, 0);
  }
}

function composeWorldMatrix(
  index: number,
  bones: readonly CcdIkBone[],
  translations: readonly [number, number, number][],
  rotations: readonly QuatTuple[],
  matrices: Float32Array,
  states: Uint8Array,
  local: Float32Array
): void {
  if (states[index] === 2) {
    return;
  }
  if (states[index] === 1) {
    throw new RangeError("CCD IK bone parent chain must not contain cycles");
  }

  states[index] = 1;
  const targetOffset = index * matrixElementCount;
  const parentIndex = bones[index]?.parentIndex ?? -1;
  if (parentIndex >= 0) {
    composeWorldMatrix(parentIndex, bones, translations, rotations, matrices, states, local);
    composeColumnMajorMatrixInto(
      translations[index] ?? [0, 0, 0],
      rotations[index] ?? [0, 0, 0, 1],
      local
    );
    multiplyColumnMajorMatricesInto(
      matrices,
      parentIndex * matrixElementCount,
      local,
      0,
      matrices,
      targetOffset
    );
  } else {
    composeColumnMajorMatrixInto(
      translations[index] ?? [0, 0, 0],
      rotations[index] ?? [0, 0, 0, 1],
      local
    );
    setMatrix(matrices, targetOffset, local, 0);
  }
  states[index] = 2;
}

function composeColumnMajorMatrixInto(
  translation: [number, number, number],
  rotation: QuatTuple,
  target: Float32Array
): void {
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
  target[3] = 0;
  target[4] = xy - wz;
  target[5] = 1 - (xx + zz);
  target[6] = yz + wx;
  target[7] = 0;
  target[8] = xz + wy;
  target[9] = yz - wx;
  target[10] = 1 - (xx + yy);
  target[11] = 0;
  target[12] = translation[0];
  target[13] = translation[1];
  target[14] = translation[2];
  target[15] = 1;
}

function multiplyColumnMajorMatricesInto(
  left: Float32Array,
  leftOffset: number,
  right: Float32Array,
  rightOffset: number,
  target: Float32Array,
  targetOffset: number
): void {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      target[targetOffset + column * 4 + row] =
        left[leftOffset + row] * right[rightOffset + column * 4] +
        left[leftOffset + 4 + row] * right[rightOffset + column * 4 + 1] +
        left[leftOffset + 8 + row] * right[rightOffset + column * 4 + 2] +
        left[leftOffset + 12 + row] * right[rightOffset + column * 4 + 3];
    }
  }
}

function setMatrix(
  target: Float32Array,
  targetOffset: number,
  source: Float32Array,
  sourceOffset: number
): void {
  for (let index = 0; index < matrixElementCount; index += 1) {
    target[targetOffset + index] = source[sourceOffset + index];
  }
}

export function matrixTranslation(matrices: Float32Array, index: number): [number, number, number] {
  return matrixTranslationInto(matrices, index, [0, 0, 0]);
}

export function matrixTranslationInto(
  matrices: Float32Array,
  index: number,
  target: [number, number, number]
): [number, number, number] {
  const offset = index * 16;
  target[0] = matrices[offset + 12] ?? 0;
  target[1] = matrices[offset + 13] ?? 0;
  target[2] = matrices[offset + 14] ?? 0;
  return target;
}

export function transformDirectionByInverseMatrixInto(
  vector: [number, number, number],
  matrices: Float32Array,
  boneIndex: number,
  target: [number, number, number]
): [number, number, number] {
  const offset = boneIndex * 16;
  const x = vector[0];
  const y = vector[1];
  const z = vector[2];
  target[0] =
    x * (matrices[offset] ?? 0) +
    y * (matrices[offset + 1] ?? 0) +
    z * (matrices[offset + 2] ?? 0);
  target[1] =
    x * (matrices[offset + 4] ?? 0) +
    y * (matrices[offset + 5] ?? 0) +
    z * (matrices[offset + 6] ?? 0);
  target[2] =
    x * (matrices[offset + 8] ?? 0) +
    y * (matrices[offset + 9] ?? 0) +
    z * (matrices[offset + 10] ?? 0);
  return target;
}
