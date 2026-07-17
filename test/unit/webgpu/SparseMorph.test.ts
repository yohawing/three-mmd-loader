import { describe, expect, it, vi } from "vitest";

import {
  denseMorphProviderSymbol,
  type DenseMorphProvider
} from "../../../src/parser/model/denseMorphProvider.js";
import type { ThreeMmdGeometryMorph } from "../../../src/three/geometry.js";
import {
  packMmdPositionMorphsToVertexCsr,
  packMmdUvMorphsToVertexCsr
} from "../../../src/webgpu/sparse-morph.js";

describe("position morph CSR packing", () => {
  it("packs sparse offsets in vertex-major and morph-index order", () => {
    const packed = packMmdPositionMorphsToVertexCsr(3, [
      { vertexOffsets: [{ vertexIndex: 2, position: [0.25, 0.5, 0.75] }] },
      {
        vertexOffsets: [
          { vertexIndex: 0, position: [1, 2, 3] },
          { vertexIndex: 2, position: [4, 5, 6] }
        ]
      }
    ]);

    expect(Array.from(packed.rowOffsets)).toEqual([0, 1, 1, 3]);
    expect(Array.from(packed.morphIndices)).toEqual([1, 0, 1]);
    expect(Array.from(packed.values)).toEqual([1, 2, -3, 0.25, 0.5, -0.75, 4, 5, -6]);
    expect(packed.vertexCount).toBe(3);
    expect(packed.morphCount).toBe(2);
  });

  it("keeps the last duplicate sparse offset and drops zero entries", () => {
    const packed = packMmdPositionMorphsToVertexCsr(2, [
      {
        vertexOffsets: [
          { vertexIndex: 0, position: [1, 1, 1] },
          { vertexIndex: 0, position: [2, 3, 4] },
          { vertexIndex: 1, position: [0, 0, 0] }
        ]
      }
    ]);

    expect(Array.from(packed.rowOffsets)).toEqual([0, 1, 1]);
    expect(Array.from(packed.morphIndices)).toEqual([0]);
    expect(Array.from(packed.values)).toEqual([2, 3, -4]);
  });

  it("prefers converted dense offsets over sparse offsets", () => {
    const packed = packMmdPositionMorphsToVertexCsr(2, [
      {
        vertexOffsets: [{ vertexIndex: 0, position: [9, 9, 9] }],
        densePositionOffsets: new Float32Array([0, 0, 0, 0.5, -0.25, -1.5])
      }
    ]);

    expect(Array.from(packed.rowOffsets)).toEqual([0, 0, 1]);
    expect(Array.from(packed.values)).toEqual([0.5, -0.25, -1.5]);
  });

  it("uses a dense provider once and keeps its converted coordinates", () => {
    const createPositionOffsets = vi.fn(() => new Float32Array([0.1, 0.2, -0.3]));
    const provider: DenseMorphProvider = {
      createPositionOffsets,
      createUvOffsets: () => undefined,
      createAdditionalUvOffsets: () => undefined
    };
    const morph = {
      vertexOffsets: [{ vertexIndex: 0, position: [9, 9, 9] }],
      [denseMorphProviderSymbol]: provider
    } satisfies ThreeMmdGeometryMorph & { [denseMorphProviderSymbol]: DenseMorphProvider };

    const packed = packMmdPositionMorphsToVertexCsr(1, [morph]);

    expect(createPositionOffsets).toHaveBeenCalledOnce();
    expect(createPositionOffsets).toHaveBeenCalledWith(1);
    expect(packed.values[0]).toBeCloseTo(0.1);
    expect(packed.values[1]).toBeCloseTo(0.2);
    expect(packed.values[2]).toBeCloseTo(-0.3);
  });

  it("returns empty typed arrays when no position offsets exist", () => {
    const packed = packMmdPositionMorphsToVertexCsr(2, [{}, {}]);

    expect(Array.from(packed.rowOffsets)).toEqual([0, 0, 0]);
    expect(packed.morphIndices).toBeInstanceOf(Uint32Array);
    expect(packed.morphIndices).toHaveLength(0);
    expect(packed.values).toHaveLength(0);
  });

  it("rejects invalid counts, indices, values, and dense lengths", () => {
    expect(() => packMmdPositionMorphsToVertexCsr(-1, [])).toThrow(
      "MMD_POSITION_MORPH_CSR_VERTEX_COUNT_INVALID"
    );
    expect(() => packMmdPositionMorphsToVertexCsr(1, [
      { vertexOffsets: [{ vertexIndex: 1, position: [0, 0, 0] }] }
    ])).toThrow("MMD_POSITION_MORPH_CSR_VERTEX_INDEX_INVALID");
    expect(() => packMmdPositionMorphsToVertexCsr(1, [
      { vertexOffsets: [{ vertexIndex: 0, position: [Number.NaN, 0, 0] }] }
    ])).toThrow("MMD_POSITION_MORPH_CSR_VALUE_INVALID");
    expect(() => packMmdPositionMorphsToVertexCsr(1, [
      { densePositionOffsets: new Float32Array(2) }
    ])).toThrow("MMD_POSITION_MORPH_CSR_DENSE_LENGTH_INVALID");
  });
});

describe("UV morph CSR packing", () => {
  it("packs main UV offsets with last-write-wins ordering", () => {
    const packed = packMmdUvMorphsToVertexCsr(2, [
      { uvOffsets: [{ vertexIndex: 1, uv: [0.1, 0.2] }, { vertexIndex: 1, uv: [0.3, 0.4] }] },
      { denseUvOffsets: new Float32Array([0.5, 0.6, 0, 0]) }
    ]);
    expect(packed.componentCount).toBe(2);
    expect(Array.from(packed.rowOffsets)).toEqual([0, 1, 2]);
    expect(Array.from(packed.morphIndices)).toEqual([1, 0]);
    expect(Array.from(packed.values)).toEqual(
      [0.5, 0.6, 0.3, 0.4].map((value) => expect.closeTo(value))
    );
  });

  it("packs only the selected additional UV channel", () => {
    const packed = packMmdUvMorphsToVertexCsr(1, [{ additionalUvOffsets: [
      { vertexIndex: 0, uvIndex: 0, uv: [1, 2, 3, 4] },
      { vertexIndex: 0, uvIndex: 1, uv: [5, 6, 7, 8] }
    ] }], 1);
    expect(packed.componentCount).toBe(4);
    expect(Array.from(packed.values)).toEqual([5, 6, 7, 8]);
  });
});
