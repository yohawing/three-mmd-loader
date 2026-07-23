import * as THREE from "three/webgpu";
import { describe, expect, it, vi } from "vitest";

import {
  createMmdTslPipeline,
  createModelLoadOptions
} from "../../../src/webgpu/index.js";

function createRenderer(): THREE.WebGPURenderer {
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: true },
    reversedDepthBuffer: false,
    init: vi.fn(async () => undefined),
    render: vi.fn()
  } as unknown as THREE.WebGPURenderer;
}

describe("MMD TSL pipeline facade", () => {
  it("centralizes native WebGPU model load flags", () => {
    expect(createModelLoadOptions()).toMatchObject({
      frustumCulled: false,
      morphSplit: false,
      morphAttributes: false,
      outline: false,
      materialRenderOrder: false
    });
    expect(createModelLoadOptions({ morphAttributes: true, customFlag: "test" })).toMatchObject({
      morphAttributes: true,
      customFlag: "test"
    });
  });

  it("initializes and rejects non-native renderers clearly", async () => {
    const renderer = createRenderer();
    const pipeline = await createMmdTslPipeline(renderer);
    expect(renderer.init).toHaveBeenCalledTimes(1);
    pipeline.dispose();

    await expect(
      createMmdTslPipeline({ init: vi.fn(async () => undefined) } as unknown as THREE.WebGPURenderer)
    ).rejects.toThrow("MMD_TSL_PIPELINE_NATIVE_WEBGPU_REQUIRED");
  });

  it("attaches idempotently and releases only pipeline-owned resources", async () => {
    const renderer = createRenderer();
    const pipeline = await createMmdTslPipeline(renderer);
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    mesh.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    mesh.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    const bone = new THREE.Bone();
    mesh.bind(new THREE.Skeleton([bone]));
    const model = { root: new THREE.Group(), mesh };

    expect(pipeline.attach(model)).toBe(true);
    expect(pipeline.attach(model)).toBe(false);
    expect(mesh.userData.mmdTslSparsePositionMorphs).toBe(false);
    expect(pipeline.prepareRender(new THREE.Scene())).toBe(true);
    expect(pipeline.render(new THREE.Scene(), new THREE.Camera())).toBe(true);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(pipeline.detach(model)).toBe(true);
    expect(mesh.userData.mmdTslSparsePositionMorphs).toBeUndefined();
    expect(pipeline.detach(model)).toBe(false);
    pipeline.dispose();
  });
});
