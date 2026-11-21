import { describe, expect, it, vi } from "vitest";
import { ThreeMmdLoader, type MmdCameraState, type MmdLightState } from "../../../src/index.js";
import { WasmVmdCameraTrack, WasmVmdLightTrack } from "../../../src/parser/wasm/generated/mmd_anim_wasm.js";
// @ts-expect-error -- plain ESM fixture generator without declarations
import { generateCameraLightVmd } from "../../../scripts/fixtures/generate-minimal-vmd.mjs";

describe("loader track samplers", () => {
  it("samples camera frames with WASM and TypeScript", async () => {
    const loader = new ThreeMmdLoader();
    const loaded = await loader.loadAnimation(generateCameraLightVmd("camera-near"));
    const wasm = loader.createCameraTrackSampler(loaded);
    const fallback = new ThreeMmdLoader().createCameraTrackSampler(loaded.animation);
    const target: MmdCameraState = { distance: 0, position: [0, 0, 0], rotation: [0, 0, 0], fov: 0, perspective: false };
    const expected = structuredClone(target);
    const free = vi.spyOn(WasmVmdCameraTrack.prototype, "free");
    const sample = vi.spyOn(WasmVmdCameraTrack.prototype, "sample");
    try {
      expect(wasm.sampleInto(0, target)).toBe(target);
      expect(fallback.sampleInto(0, expected)).toBe(expected);
      expect(target).toEqual({
        position: expected.position.map(Math.fround),
        rotation: expected.rotation.map(Math.fround),
        distance: Math.fround(expected.distance),
        fov: Math.fround(expected.fov),
        perspective: expected.perspective
      });
      sample.mockReturnValueOnce(false).mockImplementationOnce(() => { throw new RangeError(); });
      expect(wasm.sampleInto(1, target)).toBeUndefined();
      expect(wasm.sampleInto(2, target)).toBeUndefined();
      expect(sample.mock.calls[0][1]).toBe(sample.mock.calls[2][1]);
      wasm.dispose();
      wasm.dispose();
      expect(free).toHaveBeenCalledTimes(1);
      expect(wasm.sampleInto(3, target)).toBeUndefined();
      fallback.dispose();
      fallback.dispose();
      expect(fallback.sampleInto(0, expected)).toBeUndefined();
      const empty = loader.createLightTrackSampler(loaded);
      expect(empty.sampleInto(0, { direction: [0, 0, 0], color: [0, 0, 0] })).toBeUndefined();
      empty.dispose();
    } finally {
      wasm.dispose();
      sample.mockRestore();
      free.mockRestore();
    }
  });

  it("samples light frames with WASM and TypeScript", async () => {
    const loader = new ThreeMmdLoader();
    const loaded = await loader.loadAnimation(generateCameraLightVmd("light-front"));
    const wasm = loader.createLightTrackSampler(loaded);
    const fallback = new ThreeMmdLoader().createLightTrackSampler(loaded.animation);
    const target: MmdLightState = { direction: [0, 0, 0], color: [0, 0, 0] };
    const expected = structuredClone(target);
    const free = vi.spyOn(WasmVmdLightTrack.prototype, "free");
    const sample = vi.spyOn(WasmVmdLightTrack.prototype, "sample");
    try {
      expect(wasm.sampleInto(0, target)).toBe(target);
      expect(fallback.sampleInto(0, expected)).toBe(expected);
      expect(target).toEqual({
        color: expected.color.map(Math.fround),
        direction: expected.direction.map(Math.fround)
      });
      sample.mockReturnValueOnce(false).mockImplementationOnce(() => { throw new RangeError(); });
      expect(wasm.sampleInto(1, target)).toBeUndefined();
      expect(wasm.sampleInto(2, target)).toBeUndefined();
      expect(sample.mock.calls[0][1]).toBe(sample.mock.calls[2][1]);
      wasm.dispose();
      wasm.dispose();
      expect(free).toHaveBeenCalledTimes(1);
      expect(wasm.sampleInto(3, target)).toBeUndefined();
      fallback.dispose();
      fallback.dispose();
      expect(fallback.sampleInto(0, expected)).toBeUndefined();
      const empty = loader.createCameraTrackSampler(loaded);
      expect(empty.sampleInto(0, { distance: 0, position: [0, 0, 0], rotation: [0, 0, 0], fov: 0, perspective: true })).toBeUndefined();
      empty.dispose();
    } finally {
      wasm.dispose();
      sample.mockRestore();
      free.mockRestore();
    }
  });
});
