import * as THREE from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import { createMmdTslSelfShadowPass } from "../../../src/webgpu/self-shadow-pass.js";

describe("MMD reference shadow target", () => {
  it("keeps reference depth separate from raster depth and switches mode without rebuilding", () => {
    const light = new THREE.DirectionalLight();
    light.shadow.mapSize.set(2048,2048);
    const renderer = { reversedDepthBuffer: true, shadowMap: { type: THREE.BasicShadowMap } } as THREE.WebGPURenderer;
    const pass = createMmdTslSelfShadowPass(renderer,light);
    expect(pass.renderTarget.texture.type).toBe(THREE.FloatType);
    expect(pass.renderTarget.texture.format).toBe(THREE.RedFormat);
    expect(pass.renderTarget.texture).not.toBe(pass.depthTexture);
    const node = pass.visibilityNode;
    expect(pass.setMode(2)).toBe(true);
    expect(pass.setMode(2)).toBe(false);
    expect(pass.setMode(1)).toBe(true);
    expect(pass.visibilityNode).toBe(node);
    const dispose = vi.spyOn(pass.renderTarget,"dispose");
    pass.dispose(); pass.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
