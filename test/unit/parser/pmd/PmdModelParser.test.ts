import { describe, expect, it } from "vitest";

import { parsePmd } from "../../../../src/parser/model/PmdModelParser.js";

describe("parsePmd section count guards", () => {
  it("rejects impossible section counts before allocating geometry buffers", () => {
    expect(() => parsePmd(createPmdPrefix({ vertexCount: 10_000_001 }))).toThrow(
      "Invalid PMD vertex count: 10000001"
    );

    expect(() => parsePmd(createPmdPrefix({ indexCount: 10_000_001 }))).toThrow(
      "Invalid PMD vertex index count: 10000001"
    );

    expect(() => parsePmd(createPmdPrefix({ materialCount: 10_000_001 }))).toThrow(
      "Invalid PMD material count: 10000001"
    );
  });
});

function createPmdPrefix(options: {
  readonly vertexCount?: number;
  readonly indexCount?: number;
  readonly materialCount?: number;
}): Uint8Array {
  const bytes: number[] = [];
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
  const fixedText = (text: string, byteLength: number) => {
    const encoded = new TextEncoder().encode(text);
    for (let index = 0; index < byteLength; index += 1) {
      bytes.push(encoded[index] ?? 0);
    }
  };

  fixedText("Pmd", 3);
  f32(1);
  fixedText("synthetic", 20);
  fixedText("", 256);
  u32(options.vertexCount ?? 0);
  u32(options.indexCount ?? 0);
  u32(options.materialCount ?? 0);
  return new Uint8Array(bytes);
}
