import { describe, expect, it, vi } from "vitest";
import * as THREE from "three/webgpu";

import { createThreeBufferGeometry } from "../../../src/three/geometry.js";
import {
  computeMmdTslSparsePositionMorphs,
  disposeMmdTslSparsePositionMorphs,
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
    expect(mesh.geometry.getAttribute("uv")).toHaveProperty("isStorageBufferAttribute", true);
    expect(mesh.geometry.getAttribute("uv1")).toHaveProperty("isStorageBufferAttribute", true);
    expect(mesh.geometry.morphAttributes.uv).toEqual([]);
    expect(mesh.geometry.morphAttributes.uv1).toEqual([]);
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
    expect(compute.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ isComputeNode: true, count: 3 }),
      expect.objectContaining({ isComputeNode: true, count: 3 }),
      expect.objectContaining({ isComputeNode: true, count: 3 })
    ]);
    expect(() =>
      computeMmdTslSparsePositionMorphs(
        { backend: { isWebGPUBackend: false }, compute },
        mesh
      )
    ).toThrow("MMD_TSL_SPARSE_POSITION_MORPH_REQUIRES_WEBGPU");
  });

  it("restores original attributes and morph attributes through idempotent cleanup", () => {
    const mesh = createMesh();
    const position = mesh.geometry.getAttribute("position");
    const uv = mesh.geometry.getAttribute("uv");
    const uv1 = mesh.geometry.getAttribute("uv1");
    const positionMorphs = mesh.geometry.morphAttributes.position;
    const uvMorphs = mesh.geometry.morphAttributes.uv;
    const uv1Morphs = mesh.geometry.morphAttributes.uv1;

    expect(enableMmdTslSparsePositionMorphs(mesh)).toBe(true);
    const compute = vi.fn();
    computeMmdTslSparsePositionMorphs({ backend: { isWebGPUBackend: true }, compute }, mesh);
    const submittedNodes = compute.mock.calls[0]?.[0];
    const computeNodes = Array.isArray(submittedNodes) ? submittedNodes : [submittedNodes];
    const nodeDisposeSpies = computeNodes
      .filter((node): node is THREE.Node => node != null)
      .map((node) => vi.spyOn(node, "dispose"));
    const outputAttributeDisposeSpies = ["position", "uv", "uv1"]
      .map((name) => mesh.geometry.getAttribute(name))
      .filter((attribute): attribute is THREE.BufferAttribute => attribute != null)
      .map((attribute) => vi.spyOn(attribute, "dispose"));

    expect(disposeMmdTslSparsePositionMorphs(mesh)).toBe(true);
    expect(mesh.geometry.getAttribute("position")).toBe(position);
    expect(mesh.geometry.getAttribute("uv")).toBe(uv);
    expect(mesh.geometry.getAttribute("uv1")).toBe(uv1);
    expect(mesh.geometry.morphAttributes.position).toBe(positionMorphs);
    expect(mesh.geometry.morphAttributes.uv).toBe(uvMorphs);
    expect(mesh.geometry.morphAttributes.uv1).toBe(uv1Morphs);
    for (const disposeSpy of nodeDisposeSpies) {
      expect(disposeSpy).toHaveBeenCalledOnce();
    }
    for (const disposeSpy of outputAttributeDisposeSpies) {
      expect(disposeSpy).toHaveBeenCalledOnce();
    }
    expect(disposeMmdTslSparsePositionMorphs(mesh)).toBe(false);
    expect(
      computeMmdTslSparsePositionMorphs(
        { backend: { isWebGPUBackend: true }, compute: vi.fn() },
        mesh
      )
    ).toBe(false);
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

  it("enables and disposes sparse morph compute from geometry loaded without dense attributes", () => {
    const geometry = createThreeBufferGeometry(createBuffers(), [], [
      { vertexOffsets: [{ vertexIndex: 0, position: [0.5, 0, 0] }] }
    ], { morphAttributes: false });
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicNodeMaterial());
    mesh.morphTargetInfluences = [0];

    expect(geometry.morphAttributes.position).toBeUndefined();
    expect(enableMmdTslSparsePositionMorphs(mesh)).toBe(true);
    expect(geometry.morphAttributes.position).toEqual([]);
    expect(disposeMmdTslSparsePositionMorphs(mesh)).toBe(true);
    expect(geometry.morphAttributes.position).toBeUndefined();
  });
});

function createMesh(): THREE.SkinnedMesh {
  const geometry = createThreeBufferGeometry(createBuffers(), [], [
    {
      vertexOffsets: [{ vertexIndex: 0, position: [0.5, 0, 0] }],
      uvOffsets: [{ vertexIndex: 0, uv: [0.1, 0.2] }],
      additionalUvOffsets: [{ vertexIndex: 0, uvIndex: 0, uv: [0.1, 0.2, 0.3, 0.4] }]
    },
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
    additionalUvs: [new Float32Array(12)],
    indices: new Uint16Array([0, 1, 2]),
    skinIndices: new Uint16Array(12),
    skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
  };
}
