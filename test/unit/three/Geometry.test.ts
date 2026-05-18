import { describe, expect, it } from "vitest";

import { createThreeBufferGeometry } from "../../../src/three/index.js";
import type { ThreeMmdGeometryBuffers, ThreeMmdGeometryMorph } from "../../../src/three/index.js";
import type * as THREE from "three";

describe("createThreeBufferGeometry", () => {
  it("converts MMD vertex buffers into Three.js coordinate space", () => {
    const geometry = createThreeBufferGeometry(createQuadBuffers());

    expectAttributeArray(geometry, "position", [0, 0, -1, 1, 0, -2, 1, 1, -3, 0, 1, -4]);
    expectAttributeArray(geometry, "normal", [0, 0, -1, 0, 1, 0, 1, 0, 0, 0, -1, 0]);
    expectAttributeArray(geometry, "uv", [0, 0, 1, 0, 1, 1, 0, 1]);
    expect(Array.from(geometry.index?.array ?? [])).toEqual([0, 2, 1, 0, 3, 2]);
  });

  it("preserves imported vertex normals instead of replacing them with face normals", () => {
    const geometry = createThreeBufferGeometry({
      ...createQuadBuffers(),
      positions: new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1]),
      normals: new Float32Array([0, 1, 0, 0.5, 0.5, 0, 1, 0, 0]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2]),
      skinIndices: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
    });

    expectAttributeArray(geometry, "normal", [0, 1, -0, 0.5, 0.5, -0, 1, 0, -0]);
    expect(Array.from(geometry.index?.array ?? [])).toEqual([0, 2, 1]);
  });

  it("attaches additional UV, skinning, edge scale, and SDEF attributes", () => {
    const geometry = createThreeBufferGeometry({
      ...createQuadBuffers(),
      edgeScale: new Float32Array([1, 0.5, 0.25, 0]),
      additionalUvs: [new Float32Array([0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1])],
      sdef: {
        enabled: new Float32Array([1, 0, 1, 0]),
        c: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        r0: new Float32Array([0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4]),
        r1: new Float32Array([0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0]),
        rw0: new Float32Array([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]),
        rw1: new Float32Array([1, 2, 3, 2, 3, 4, 3, 4, 5, 4, 5, 6])
      }
    });

    expectAttributeArray(geometry, "uv1", [0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1]);
    expectAttributeArray(geometry, "skinIndex", [0, 1, 0, 0, 1, 2, 0, 0, 2, 3, 0, 0, 3, 4, 0, 0]);
    expectAttributeArray(
      geometry,
      "skinWeight",
      [1, 0, 0, 0, 0.75, 0.25, 0, 0, 0.5, 0.5, 0, 0, 0.25, 0.75, 0, 0]
    );
    expectAttributeArray(geometry, "mmdEdgeScale", [1, 0.5, 0.25, 0]);
    expectAttributeArray(geometry, "matricesSdefEnabled", [1, 0, 1, 0]);
    expectAttributeArray(geometry, "matricesSdefC", [1, 2, -3, 4, 5, -6, 7, 8, -9, 10, 11, -12]);
    expectAttributeArray(
      geometry,
      "matricesSdefRW0",
      [0.5, 1.5, -2.5, 3.5, 4.5, -5.5, 6.5, 7.5, -8.5, 9.5, 10.5, -11.5]
    );
    expect(geometry.userData.mmdEdgeScale).toEqual({ vertexCount: 4 });
    expect(geometry.userData.mmdSdef).toEqual({ vertexCount: 4 });
  });

  it("prefers explicit material groups and can derive groups from material face counts", () => {
    const explicitGroups = createThreeBufferGeometry({
      ...createQuadBuffers(),
      materialGroups: [
        { start: 3, count: 3, materialIndex: 1 },
        { start: 0, count: 3, materialIndex: 0 }
      ]
    });
    const materialGroups = createThreeBufferGeometry(createQuadBuffers(), [
      { faceCount: 1 },
      { faceCount: 1 }
    ]);

    expect(explicitGroups.groups).toEqual([
      { start: 3, count: 3, materialIndex: 1 },
      { start: 0, count: 3, materialIndex: 0 }
    ]);
    expect(materialGroups.groups).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 }
    ]);
  });

  it("converts vertex, UV, and additional UV morph offsets into relative morph attributes", () => {
    const morphs: ThreeMmdGeometryMorph[] = [
      {
        vertexOffsets: [{ vertexIndex: 2, position: [0.25, -0.5, 1.5] }],
        uvOffsets: [{ vertexIndex: 1, uv: [0.125, -0.25, 0, 0] }],
        additionalUvOffsets: [{ vertexIndex: 0, uvIndex: 0, uv: [0.1, 0.2, 0.3, 0.4] }]
      }
    ];
    const geometry = createThreeBufferGeometry(
      {
        ...createQuadBuffers(),
        additionalUvs: [new Float32Array(16)]
      },
      [],
      morphs
    );

    expect(geometry.morphTargetsRelative).toBe(true);
    expect(Array.from(geometry.morphAttributes.position?.[0]?.array ?? [])).toEqual([
      0, 0, 0, 0, 0, 0, 0.25, -0.5, -1.5, 0, 0, 0
    ]);
    expect(Array.from(geometry.morphAttributes.uv?.[0]?.array ?? [])).toEqual([
      0, 0, 0.125, -0.25, 0, 0, 0, 0
    ]);
    expectFloatArrayClose(
      Array.from(geometry.morphAttributes.uv1?.[0]?.array ?? []),
      [0.1, 0.2, 0.3, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    );
  });

  it("rejects malformed geometry buffers before creating Three.js attributes", () => {
    expect(() =>
      createThreeBufferGeometry({
        ...createQuadBuffers(),
        normals: new Float32Array([0, 0, 1])
      })
    ).toThrow("THREE_MMD_GEOMETRY_NORMAL_LENGTH_INVALID:3:12");

    expect(() =>
      createThreeBufferGeometry({
        ...createQuadBuffers(),
        positions: new Float32Array([0, 0, Number.NaN, 1, 0, 2, 1, 1, 3, 0, 1, 4])
      })
    ).toThrow("THREE_MMD_GEOMETRY_POSITION_NON_FINITE:2");

    expect(() =>
      createThreeBufferGeometry({
        ...createQuadBuffers(),
        indices: new Uint16Array([0, 1, 4])
      })
    ).toThrow("THREE_MMD_GEOMETRY_INDEX_OUT_OF_RANGE:2:4");

    expect(() =>
      createThreeBufferGeometry({
        ...createQuadBuffers(),
        additionalUvs: [new Float32Array([0, 0, 0, 1])]
      })
    ).toThrow("THREE_MMD_GEOMETRY_ADDITIONAL_UV_0_LENGTH_INVALID:4:16");
  });

  it("rejects invalid material groups and derived material face counts", () => {
    expect(() =>
      createThreeBufferGeometry({
        ...createQuadBuffers(),
        materialGroups: [
          { start: 0, count: 3, materialIndex: 0 },
          { start: 3, count: 4, materialIndex: 1 }
        ]
      })
    ).toThrow("THREE_MMD_GEOMETRY_MATERIAL_GROUP_RANGE_INVALID:1:3:4");

    expect(() =>
      createThreeBufferGeometry({
        ...createQuadBuffers(),
        materialGroups: [
          { start: 1, count: 3, materialIndex: 0 },
          { start: 3, count: 3, materialIndex: 1 }
        ]
      })
    ).toThrow("THREE_MMD_GEOMETRY_MATERIAL_GROUP_RANGE_INVALID:0:1:3");

    expect(() =>
      createThreeBufferGeometry({
        ...createQuadBuffers(),
        materialGroups: [
          { start: 0, count: 3, materialIndex: 0 },
          { start: 0, count: 3, materialIndex: 1 }
        ]
      })
    ).toThrow("THREE_MMD_GEOMETRY_MATERIAL_GROUP_OVERLAP:1:0");

    expect(() =>
      createThreeBufferGeometry({
        ...createQuadBuffers(),
        materialGroups: [{ start: 0, count: 3, materialIndex: 0 }]
      })
    ).toThrow("THREE_MMD_GEOMETRY_MATERIAL_GROUP_GAP:3");

    expect(() => createThreeBufferGeometry(createQuadBuffers(), [{ faceCount: 3 }])).toThrow(
      "THREE_MMD_GEOMETRY_MATERIAL_FACE_COUNT_MISMATCH:9:6"
    );

    expect(() => createThreeBufferGeometry(createQuadBuffers(), [{ faceCount: 1 }])).toThrow(
      "THREE_MMD_GEOMETRY_MATERIAL_FACE_COUNT_MISMATCH:3:6"
    );
  });

  it("rejects morph offsets that target missing vertices or additional UV sets", () => {
    expect(() =>
      createThreeBufferGeometry(
        createQuadBuffers(),
        [],
        [
          {
            vertexOffsets: [{ vertexIndex: 4, position: [0, 0, 0] }]
          }
        ]
      )
    ).toThrow("THREE_MMD_GEOMETRY_MORPH_VERTEX:0:0_INDEX_INVALID:4");

    expect(() =>
      createThreeBufferGeometry(
        createQuadBuffers(),
        [],
        [
          {
            uvOffsets: [{ vertexIndex: 0, uv: [0, Number.NaN] }]
          }
        ]
      )
    ).toThrow("THREE_MMD_GEOMETRY_MORPH_UV_INVALID:0:0:1");

    expect(() =>
      createThreeBufferGeometry(
        createQuadBuffers(),
        [],
        [
          {
            additionalUvOffsets: [{ vertexIndex: 0, uvIndex: 0, uv: [0, 0, 0, 0] }]
          }
        ]
      )
    ).toThrow("THREE_MMD_GEOMETRY_MORPH_ADDITIONAL_UV_INDEX_INVALID:0:0:0");
  });
});

function createQuadBuffers(): ThreeMmdGeometryBuffers {
  return {
    positions: new Float32Array([0, 0, 1, 1, 0, 2, 1, 1, 3, 0, 1, 4]),
    normals: new Float32Array([0, 0, 1, 0, 1, 0, 1, 0, 0, 0, -1, 0]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    skinIndices: new Uint16Array([0, 1, 0, 0, 1, 2, 0, 0, 2, 3, 0, 0, 3, 4, 0, 0]),
    skinWeights: new Float32Array([1, 0, 0, 0, 0.75, 0.25, 0, 0, 0.5, 0.5, 0, 0, 0.25, 0.75, 0, 0])
  };
}

function expectAttributeArray(
  geometry: THREE.BufferGeometry,
  name: string,
  expected: readonly number[]
): void {
  expectFloatArrayClose(Array.from(geometry.getAttribute(name).array), expected);
}

function expectFloatArrayClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN);
  });
}
