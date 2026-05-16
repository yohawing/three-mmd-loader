import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseLoaderMmdModelData } from "../../src/three/modelAssembly.js";

describe("loader model assembly", () => {
  it("assembles the local one-bone PMX fixture into internal MMD model data", async () => {
    const bytes = await readFile(resolve("..", "data/unittest/test_1bone_cube.pmx"));

    const modelData = parseLoaderMmdModelData(bytes);

    expect(modelData.coordinateSystem).toBe("mmd-right-handed-y-up");
    expect(modelData.metadata).toMatchObject({
      format: "pmx",
      name: "テスト用モデル",
      englishName: "TestModel"
    });
    expect(modelData.geometry.positions.length).toBe(14 * 3);
    expect(modelData.geometry.indices.length).toBe(12 * 3);
    expect(modelData.materials).toHaveLength(1);
    expect(modelData.skeleton.bones).toHaveLength(1);
    expect(modelData.rigidBodies).toHaveLength(0);
  });

  it("assembles PMX fixtures that need vertex bone index size fallback", async () => {
    const bytes = await readFile(resolve("..", "data/unittest/joint_orient_test.pmx"));

    const modelData = parseLoaderMmdModelData(bytes);

    expect(modelData.metadata.format).toBe("pmx");
    expect(modelData.geometry.positions.length).toBe(24 * 3);
    expect(modelData.skeleton.bones.length).toBeGreaterThanOrEqual(1);
  });

  it("assembles meshless PMX fixtures without requiring geometry indices", async () => {
    const bytes = await readFile(resolve("..", "data/unittest/test_fix_axis.pmx"));

    const modelData = parseLoaderMmdModelData(bytes);

    expect(modelData.metadata.format).toBe("pmx");
    expect(modelData.geometry.indices).toHaveLength(0);
    expect(modelData.skeleton.bones.length).toBeGreaterThanOrEqual(1);
  });

  it("assembles a generated license-clean PMD triangle into internal MMD model data", () => {
    const modelData = parseLoaderMmdModelData(createMinimalPmdTriangleBytes());

    expect(modelData.coordinateSystem).toBe("mmd-right-handed-y-up");
    expect(modelData.metadata).toMatchObject({
      format: "pmd",
      name: "tri",
      encoding: "shift-jis"
    });
    expect(modelData.geometry.positions.length).toBe(3 * 3);
    expect(modelData.geometry.indices).toEqual(new Uint16Array([0, 1, 2]));
    expect(modelData.materials).toHaveLength(1);
    expect(modelData.materials[0]).toMatchObject({
      name: "",
      faceCount: 1
    });
    expect(modelData.skeleton.bones).toHaveLength(1);
  });
});

function createMinimalPmdTriangleBytes(): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const u32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const fixedText = (value: string, byteLength: number) => {
    const encoded = encoder.encode(value).slice(0, byteLength);
    bytes.push(...encoded, ...Array.from({ length: byteLength - encoded.byteLength }, () => 0));
  };
  const vertex = (position: readonly [number, number, number], uv: readonly [number, number]) => {
    f32(position[0]);
    f32(position[1]);
    f32(position[2]);
    f32(0);
    f32(0);
    f32(1);
    f32(uv[0]);
    f32(uv[1]);
    u16(0);
    u16(0);
    u8(100);
    u8(0);
  };

  bytes.push(...encoder.encode("Pmd"));
  f32(1);
  fixedText("tri", 20);
  fixedText("generated test triangle", 256);
  u32(3);
  vertex([0, 0, 0], [0, 0]);
  vertex([1, 0, 0], [1, 0]);
  vertex([0, 1, 0], [0, 1]);
  u32(3);
  u16(0);
  u16(1);
  u16(2);
  u32(1);
  f32(0.8);
  f32(0.4);
  f32(0.2);
  f32(1);
  f32(16);
  f32(0.1);
  f32(0.1);
  f32(0.1);
  f32(0.2);
  f32(0.2);
  f32(0.2);
  u8(255);
  u8(1);
  u32(3);
  fixedText("", 20);
  u16(1);
  fixedText("root", 20);
  u16(0xffff);
  u16(0xffff);
  u8(0);
  u16(0xffff);
  f32(0);
  f32(0);
  f32(0);
  u16(0);
  u16(0);

  return new Uint8Array(bytes);
}
