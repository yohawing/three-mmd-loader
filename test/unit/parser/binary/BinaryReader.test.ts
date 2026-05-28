import { describe, expect, it } from "vitest";

import { BinaryReader, toUint8Array } from "../../../../src/parser/binary/index.js";

describe("BinaryReader", () => {
  it("reads little-endian numeric values and advances offsets", () => {
    const bytes = new Uint8Array([
      0xff, 0x7f, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12, 0x00, 0x00, 0x80, 0x3f
    ]);
    const reader = new BinaryReader(bytes);

    expect(reader.i8()).toBe(-1);
    expect(reader.u8()).toBe(0x7f);
    expect(reader.u16()).toBe(0x1234);
    expect(reader.i32()).toBe(0x12345678);
    expect(reader.f32()).toBe(1);
    expect(reader.remaining).toBe(0);
  });

  it("returns byte copies and advances offsets", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const reader = new BinaryReader(bytes);
    const slice = reader.bytes(2);

    expect([...slice]).toEqual([1, 2]);
    slice[0] = 9;
    expect(bytes[0]).toBe(1);
    expect(reader.offset).toBe(2);
  });

  it("skips bytes and reads signed PMX indices", () => {
    const reader = new BinaryReader(new Uint8Array([0, 0xfe, 0xff, 0xff, 0xff]));

    reader.skip(1);
    expect(reader.index(1)).toBe(-2);
    expect(reader.index(2)).toBe(-1);
  });

  it("rejects unsupported index sizes", () => {
    const reader = new BinaryReader(new Uint8Array([0]));

    expect(() => reader.index(3)).toThrow("Unsupported PMX index size: 3");
  });

  it("throws with offset information on truncated reads", () => {
    const reader = new BinaryReader(new Uint8Array([1, 2]));

    reader.u8();
    expect(() => reader.u16()).toThrow(
      "Unexpected end of buffer at 1; need 2 bytes through 3, have 2"
    );
  });
});

describe("toUint8Array", () => {
  it("keeps Uint8Array inputs by reference", () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(toUint8Array(bytes)).toBe(bytes);
  });

  it("wraps ArrayBuffer inputs", () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;

    expect([...toUint8Array(buffer)]).toEqual([1, 2, 3]);
  });
});
