import { describe, expect, it, vi } from "vitest";
import * as THREE from "three/webgpu";

import { createThreeBufferGeometry } from "../../../src/three/geometry.js";
import {
  computeMmdTslSparsePositionMorphs,
  enableMmdTslSparsePositionMorphs
} from "../../../src/webgpu/sparse-morph-runtime.js";

describe("sparse position morph runtime", () => {
  it("replaces dense position morph attributes with compute storage output", () => {
    const mesh = createMesh();
    const densePositionMorphs = mesh.geometry.morphAttributes.position;

    expect(densePositionMorphs).toHaveLength(2);
    expect(enableMmdTslSparsePositionMorphs(mesh)).toBe(true);
    expect(enableMmdTslSparsePositionMorphs(mesh)).toBe(true);
    expect(mesh.geometry.morphAttributes.position).toEqual([]);
    expect(mesh.geometry.getAttribute("position")).toMatchObject({
      isStorageBufferAttribute: true,
      count: 3,
      itemSize: 3
    });
  });

  it("syncs weights and submits compute only to a native WebGPU renderer", () => {
    const mesh = createMesh();
    expect(enableMmdTslSparsePositionMorphs(mesh)).toBe(true);
    mesh.morphTargetInfluences = [0.25, 0.75];
    const compute = vi.fn();

    expect(
      computeMmdTslSparsePositionMorphs(
        { backend: { isWebGPUBackend: true }, compute },
        mesh
      )
    ).toBe(true);
    expect(compute).toHaveBeenCalledOnce();
    expect(compute.mock.calls[0]?.[0]).toMatchObject({ isComputeNode: true, count: 3 });
    expect(() =>
      computeMmdTslSparsePositionMorphs(
        { backend: { isWebGPUBackend: false }, compute },
        mesh
      )
    ).toThrow("MMD_TSL_SPARSE_POSITION_MORPH_REQUIRES_WEBGPU");
  });

  it("leaves meshes without position morph entries unchanged", () => {
    const geometry = createThreeBufferGeometry(createBuffers());
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicNodeMaterial());

    expect(enableMmdTslSparsePositionMorphs(mesh)).toBe(false);
    expect(
      computeMmdTslSparsePositionMorphs(
        { backend: { isWebGPUBackend: true }, compute: vi.fn() },
        mesh
      )
    ).toBe(false);
    expect(geometry.getAttribute("position")).not.toHaveProperty("isStorageBufferAttribute", true);
  });
});

function createMesh(): THREE.SkinnedMesh {
  const geometry = createThreeBufferGeometry(createBuffers(), [], [
    { vertexOffsets: [{ vertexIndex: 0, position: [0.5, 0, 0] }] },
    { vertexOffsets: [{ vertexIndex: 2, position: [0, 0.25, 0] }] }
  ]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicNodeMaterial());
  mesh.morphTargetInfluences = [0, 0];
  return mesh;
}

function createBuffers() {
  return {
    positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0.5, 1]),
    indices: new Uint16Array([0, 1, 2]),
    skinIndices: new Uint16Array(12),
    skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
  };
}
