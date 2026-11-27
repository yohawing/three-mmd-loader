import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";
import { validateMmdTslSkinningCapacity } from "../../../src/webgpu/skinning-capacity.js";

function meshWithBones(count: number): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh();
  mesh.skeleton = new THREE.Skeleton(Array.from({ length: count }, () => new THREE.Bone()));
  return mesh;
}

function rendererWithLimit(bytes: number, webgpu: boolean): THREE.WebGPURenderer {
  return {
    backend: { isWebGPUBackend: webgpu, device: { limits: { maxUniformBufferBindingSize: bytes } } },
    getContext: () => ({ MAX_UNIFORM_BLOCK_SIZE: 35376, getParameter: () => bytes })
  } as unknown as THREE.WebGPURenderer;
}

describe("TSL skinning capacity", () => {
  it.each([true, false])("checks the actual device limit (WebGPU: %s)", (webgpu) => {
    const renderer = rendererWithLimit(65536, webgpu);
    expect(() => validateMmdTslSkinningCapacity(meshWithBones(1024), renderer)).not.toThrow();
    expect(() => validateMmdTslSkinningCapacity(meshWithBones(1116), renderer))
      .toThrow(/1116 bones.*1024.*non-TSL WebGL/);
    const smallerDevice = rendererWithLimit(16384, webgpu);
    expect(() => validateMmdTslSkinningCapacity(meshWithBones(256), smallerDevice)).not.toThrow();
    expect(() => validateMmdTslSkinningCapacity(meshWithBones(257), smallerDevice)).toThrow(/257 bones.*256/);
  });

  it("uses the configured WebGPU device limit rather than a fixed 1024-bone cap", () => {
    expect(() => validateMmdTslSkinningCapacity(meshWithBones(1116), rendererWithLimit(131072, true)))
      .not.toThrow();
  });

  it("reports an unavailable device limit before attempting shader compilation", () => {
    expect(() => validateMmdTslSkinningCapacity(meshWithBones(1), rendererWithLimit(0, true)))
      .toThrow(/Initialize the renderer/);
  });
});
