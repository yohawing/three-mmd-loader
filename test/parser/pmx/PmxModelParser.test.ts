import { describe, expect, it } from "vitest";

import { parsePmx } from "../../../src/parser/model/PmxModelParser.js";

describe("parsePmx vertex bone index size fallback", () => {
  it("reads vertices with the header-declared bone index size when it is correct", () => {
    const model = parsePmx(
      createMinimalPmxBytes({
        headerBoneIndexSize: 1,
        vertexBoneIndexSize: 1
      })
    );

    expect(model.metadata.indexSizes.bone).toBe(1);
    expect(model.geometry.positions).toEqual(new Float32Array([1, 2, 3]));
    expect(model.geometry.skinIndices[0]).toBe(0);
    expect(model.geometry.skinWeights[0]).toBe(1);
    expect(model.geometry.indices).toHaveLength(0);
  });

  it("falls back when the header bone index size is wrong and vertex payload uses 1 byte", () => {
    const model = parsePmx(
      createMinimalPmxBytes({
        headerBoneIndexSize: 4,
        vertexBoneIndexSize: 1,
        vertexIndexBytes: [0xff, 0xff, 0xff]
      })
    );

    expect(model.metadata.indexSizes.bone).toBe(4);
    expect(model.geometry.skinIndices[0]).toBe(0);
    expect(model.geometry.skinWeights[0]).toBe(1);
    expect(Array.from(model.geometry.indices)).toEqual([255, 255, 255]);
  });

  it("throws when no candidate can read a supported PMX vertex weight type", () => {
    expect(() =>
      parsePmx(
        createMinimalPmxBytes({
          headerBoneIndexSize: 4,
          vertexBoneIndexSize: 1,
          weightType: 9
        })
      )
    ).toThrow("Unsupported PMX vertex weight type: 9");
  });
});

interface MinimalPmxOptions {
  readonly headerBoneIndexSize: 1 | 2 | 4;
  readonly vertexBoneIndexSize: 1 | 2 | 4;
  readonly weightType?: number;
  readonly vertexIndexBytes?: readonly number[];
}

function createMinimalPmxBytes(options: MinimalPmxOptions): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const i32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const text = (value: string) => {
    const encoded = encoder.encode(value);
    i32(encoded.byteLength);
    bytes.push(...encoded);
  };
  const index = (value: number, size: 1 | 2 | 4) => {
    if (size === 1) {
      u8(value);
    } else if (size === 2) {
      const buffer = new ArrayBuffer(2);
      new DataView(buffer).setInt16(0, value, true);
      bytes.push(...new Uint8Array(buffer));
    } else {
      i32(value);
    }
  };
  const count = (value = 0) => i32(value);

  bytes.push(...encoder.encode("PMX "));
  f32(2);
  u8(8);
  u8(1);
  u8(0);
  u8(1);
  u8(1);
  u8(1);
  u8(options.headerBoneIndexSize);
  u8(1);
  u8(1);
  text("synthetic");
  text("synthetic");
  text("");
  text("");
  count(1);
  f32(1);
  f32(2);
  f32(3);
  f32(0);
  f32(1);
  f32(0);
  f32(0.25);
  f32(0.75);
  u8(options.weightType ?? 0);
  index(0, options.vertexBoneIndexSize);
  f32(1);
  count(options.vertexIndexBytes?.length ?? 0);
  bytes.push(...(options.vertexIndexBytes ?? []));
  count(0);
  count(0);
  count(0);
  count(0);
  count(0);
  count(0);
  count(0);

  return new Uint8Array(bytes);
}
