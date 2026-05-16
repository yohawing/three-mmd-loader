import { describe, expect, it } from "vitest";

import { mmdWorldMatrixToThree } from "../../../src/three/index.js";
import type { MmdWorldMatrixColumnMajorTuple } from "../../../src/three/index.js";

describe("mmdWorldMatrixToThree", () => {
  it("converts a column-major MMD world matrix into Three.js coordinate space", () => {
    const matrix: MmdWorldMatrixColumnMajorTuple = [
      1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0, 10, 11, 12, 1
    ];

    const threeMatrix = mmdWorldMatrixToThree(matrix);

    expect(Array.from(threeMatrix.elements)).toEqual([
      1, 2, -3, 0, 4, 5, -6, 0, -7, -8, 9, 0, 10, 11, -12, 1
    ]);
  });

  it("reads the selected matrix from a typed matrix buffer", () => {
    const matrices = new Float32Array([
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 1, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 1, 0, -2, 3, 4, 1
    ]);

    const threeMatrix = mmdWorldMatrixToThree(matrices, 1);

    expect(Array.from(threeMatrix.elements)).toEqual([
      1, 0, -0, 0, 0, 1, -0, 0, -0, -0, 1, 0, -2, 3, -4, 1
    ]);
  });

  it("rejects invalid matrix indices", () => {
    const matrix = new Float32Array(16);

    expect(() => mmdWorldMatrixToThree(matrix, -1)).toThrow(RangeError);
    expect(() => mmdWorldMatrixToThree(matrix, 0.5)).toThrow("MMD_WORLD_MATRIX_INDEX_INVALID:0.5");
  });

  it("rejects invalid matrix buffers", () => {
    expect(() => mmdWorldMatrixToThree(null as unknown as MmdWorldMatrixColumnMajorTuple)).toThrow(
      "MMD_WORLD_MATRIX_BUFFER_INVALID"
    );
    expect(() =>
      mmdWorldMatrixToThree({ length: "16" } as unknown as MmdWorldMatrixColumnMajorTuple)
    ).toThrow("MMD_WORLD_MATRIX_BUFFER_INVALID");
  });

  it("rejects matrix buffers that do not contain the selected matrix", () => {
    expect(() => mmdWorldMatrixToThree(new Float32Array(15), 0)).toThrow(
      "MMD_WORLD_MATRIX_BUFFER_TOO_SHORT:0:15"
    );
    expect(() => mmdWorldMatrixToThree(new Float32Array(16), 1)).toThrow(
      "MMD_WORLD_MATRIX_BUFFER_TOO_SHORT:1:16"
    );
  });

  it("rejects non-finite matrix components", () => {
    const matrix = new Float32Array(16);
    matrix[10] = Number.NaN;

    expect(() => mmdWorldMatrixToThree(matrix, 0)).toThrow(
      "MMD_WORLD_MATRIX_COMPONENT_NON_FINITE:0:10"
    );
  });
});
