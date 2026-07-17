import type * as THREE from "three/webgpu";
import * as TSL from "three/tsl";

import { getMmdGeometryMorphSource } from "../three/internal-morph-source.js";
import { packMmdPositionMorphsToVertexCsr } from "./sparse-morph.js";

interface MmdSparsePositionMorphState {
  readonly computeNode: THREE.Node;
  readonly weights: Float32Array;
  readonly weightsAttribute: THREE.BufferAttribute;
}

interface MmdWebGpuRenderer {
  readonly backend?: { readonly isWebGPUBackend?: boolean };
  compute(node: THREE.Node): Promise<void> | undefined;
}

const sparsePositionMorphStates = new WeakMap<THREE.SkinnedMesh, MmdSparsePositionMorphState>();

export function enableMmdTslSparsePositionMorphs(mesh: THREE.SkinnedMesh): boolean {
  if (sparsePositionMorphStates.has(mesh)) {
    return true;
  }
  const morphs = getMmdGeometryMorphSource(mesh.geometry);
  const position = mesh.geometry.getAttribute("position");
  const influences = mesh.morphTargetInfluences;
  if (!morphs || !(position?.array instanceof Float32Array) || !influences) {
    return false;
  }

  const vertexCount = position.count;
  const packed = packMmdPositionMorphsToVertexCsr(vertexCount, morphs);
  if (packed.morphIndices.length === 0) {
    return false;
  }

  const basePositions = TSL.attributeArray(position.array, "vec3").toReadOnly();
  const rowOffsets = TSL.attributeArray(packed.rowOffsets, "uint").toReadOnly();
  const morphIndices = TSL.attributeArray(packed.morphIndices, "uint").toReadOnly();
  const values = TSL.attributeArray(packed.values, "vec3").toReadOnly();
  const weights = new Float32Array(morphs.length);
  const weightStorage = TSL.attributeArray(weights, "float");
  const outputPositions = TSL.attributeArray(vertexCount, "vec3");

  const computeNode = TSL.Fn(() => {
    const vertexIndex = TSL.instanceIndex;
    const delta = TSL.vec3(0).toVar();
    TSL.Loop(
      {
        start: rowOffsets.element(vertexIndex),
        end: rowOffsets.element(vertexIndex.add(1)),
        type: "uint",
        condition: "<"
      },
      ({ i }) => {
        const entryMorphIndex = morphIndices.element(i);
        delta.addAssign(values.element(i).mul(weightStorage.element(entryMorphIndex)));
      }
    );
    outputPositions.element(vertexIndex).assign(basePositions.element(vertexIndex).add(delta));
  })().compute(vertexCount);

  mesh.geometry.setAttribute("position", outputPositions.value);
  mesh.geometry.morphAttributes.position = [];
  sparsePositionMorphStates.set(mesh, {
    computeNode,
    weights,
    weightsAttribute: weightStorage.value
  });
  return true;
}

export function computeMmdTslSparsePositionMorphs(
  renderer: MmdWebGpuRenderer,
  mesh: THREE.SkinnedMesh
): boolean {
  const state = sparsePositionMorphStates.get(mesh);
  if (!state) {
    return false;
  }
  if (renderer.backend?.isWebGPUBackend !== true) {
    throw new Error("MMD_TSL_SPARSE_POSITION_MORPH_REQUIRES_WEBGPU");
  }
  const influences = mesh.morphTargetInfluences;
  for (let index = 0; index < state.weights.length; index += 1) {
    state.weights[index] = influences?.[index] ?? 0;
  }
  state.weightsAttribute.needsUpdate = true;
  renderer.compute(state.computeNode);
  return true;
}
