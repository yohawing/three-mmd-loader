import { describe, expect, it } from "vitest";

import {
  compareNumberArrays,
  findOracleBoneIndex,
  findOracleMorphIndex,
  getOracleBoneMatrix,
  getOracleMorphWeight,
  getOracleStage,
  parseNativeNanoemOracleDump
} from "../../helpers/nativeNanoemOracle.js";

const syntheticOracle = {
  schemaVersion: 1,
  kind: "native-nanoem-runtime-dump",
  coordinateSpace: "mmd-world",
  matrixOrder: "column-major",
  model: {
    bones: [
      { index: 0, name: "センター" },
      { index: 1, name: "上半身" }
    ],
    morphs: [{ index: 0, name: "笑い" }]
  },
  frames: [
    {
      frame: 300,
      stages: {
        physics: {
          worldMatricesColumnMajor: [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 2, 0, 1,
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 4, 0, 1
          ],
          morphWeights: [0.25]
        }
      }
    }
  ]
};

describe("native nanoem oracle helpers", () => {
  it("validates the dump contract and indexes matrices by bone name", () => {
    const dump = parseNativeNanoemOracleDump(syntheticOracle);

    expect(findOracleBoneIndex(dump, "上半身")).toBe(1);
    expect(getOracleBoneMatrix(dump, 300, "physics", "上半身")).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 4, 0, 1
    ]);
    expect(getOracleStage(dump, 300, "physics").worldMatricesColumnMajor).toHaveLength(32);
  });

  it("indexes morph weights by morph name", () => {
    const dump = parseNativeNanoemOracleDump(syntheticOracle);

    expect(findOracleMorphIndex(dump, "笑い")).toBe(0);
    expect(getOracleMorphWeight(dump, 300, "physics", "笑い")).toBe(0.25);
  });

  it("reports bounded matrix comparison error", () => {
    expect(compareNumberArrays([1, 2.00005, 3], [1, 2, 3], 1e-4)).toMatchObject({
      ok: true,
      maxAbsError: expect.closeTo(0.00005, 8),
      worst: {
        index: 1,
        expected: 2,
        actual: 2.00005,
        error: expect.closeTo(0.00005, 8)
      }
    });

    expect(compareNumberArrays([1, 2.001, 3], [1, 2, 3], 1e-4)).toMatchObject({
      ok: false,
      maxAbsError: expect.closeTo(0.001, 8)
    });
  });

  it("rejects dumps that are not native nanoem mmd-world column-major oracles", () => {
    expect(() =>
      parseNativeNanoemOracleDump({
        ...syntheticOracle,
        coordinateSpace: "three-world"
      })
    ).toThrow("coordinateSpace");
  });
});
