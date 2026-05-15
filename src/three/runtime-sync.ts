import * as THREE from "three";

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
