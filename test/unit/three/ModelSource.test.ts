import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isModelSource,
  readModelSourceBytes
} from "../../../src/three/modelSource.js";

describe("ModelSource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("fetches string URL sources as bytes", async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes))
    );

    await expect(readModelSourceBytes("https://example.test/model.pmx")).resolves.toEqual(bytes);
    expect(fetch).toHaveBeenCalledWith("https://example.test/model.pmx");
  });

  it("rejects failed string URL fetches with status context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(undefined, { status: 404 }))
    );

    await expect(readModelSourceBytes("https://example.test/missing.pmx")).rejects.toThrow(
      "Failed to fetch MMD source https://example.test/missing.pmx: 404"
    );
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
