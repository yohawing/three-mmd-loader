import { describe, expect, it } from "vitest";

import {
  isModelSource,
  MODEL_SOURCE_STRING_UNRESOLVED,
  readModelSourceBytes
} from "../../src/index.js";

describe("ModelSource", () => {
  it("recognizes supported source shapes without reading them", () => {
    expect(isModelSource("model.pmx")).toBe(true);
    expect(isModelSource(new ArrayBuffer(3))).toBe(true);
    expect(isModelSource(new Uint8Array(3))).toBe(true);
    expect(isModelSource({ arrayBuffer: async () => new ArrayBuffer(0) })).toBe(false);
    expect(isModelSource(null)).toBe(false);
  });

  it("normalizes ArrayBuffer sources to bytes", async () => {
    const buffer = new ArrayBuffer(3);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3]);

    await expect(readModelSourceBytes(buffer)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns Uint8Array sources without copying", async () => {
    const bytes = new Uint8Array([4, 5, 6]);

    await expect(readModelSourceBytes(bytes)).resolves.toBe(bytes);
  });

  it("rejects string sources until URL/file path policy is defined", async () => {
    await expect(readModelSourceBytes("model.pmx")).rejects.toThrow(MODEL_SOURCE_STRING_UNRESOLVED);
  });

  it("normalizes File sources when the runtime provides File", async () => {
    if (typeof File === "undefined") {
      return;
    }

    const file = new File([new Uint8Array([7, 8, 9])], "model.pmx");

    expect(isModelSource(file)).toBe(true);
    await expect(readModelSourceBytes(file)).resolves.toEqual(new Uint8Array([7, 8, 9]));
  });
});
