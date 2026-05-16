import { describe, expect, it } from "vitest";

import { detectModelFormat } from "../../../src/parser/index.js";

describe("detectModelFormat", () => {
  it("detects PMX from the file signature", () => {
    expect(detectModelFormat(new Uint8Array([0x50, 0x4d, 0x58, 0x20, 0x32]))).toBe("pmx");
  });

  it("detects PMD from the file signature", () => {
    expect(detectModelFormat(new Uint8Array([0x50, 0x6d, 0x64, 0x00, 0x00]))).toBe("pmd");
  });

  it("rejects unknown model signatures", () => {
    expect(() => detectModelFormat(new Uint8Array([0x56, 0x4d, 0x44, 0x00]))).toThrow(
      "Unable to detect MMD model format"
    );
  });

  it("rejects truncated input", () => {
    expect(() => detectModelFormat(new Uint8Array([0x50, 0x4d, 0x58]))).toThrow(
      "Unable to detect MMD model format"
    );
  });
});
