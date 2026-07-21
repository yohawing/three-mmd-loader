import type * as THREE from "three/webgpu";
import * as TSL from "three/tsl";

import { getMmdGeometryMorphSource } from "../three/internal-morph-source.js";
import {
  packMmdPositionMorphsToVertexCsr,
  packMmdUvMorphsToVertexCsr,
  type MmdPositionMorphCsr
} from "./sparse-morph.js";

interface MmdSparsePositionMorphState {
  readonly computeNodes: THREE.Node[];
  readonly weights: Float32Array;
  readonly weightsAttributes: THREE.BufferAttribute[];
  readonly storageAttributes: THREE.BufferAttribute[];
  readonly replacedAttributes: MmdSparseMorphAttributeState[];
}

interface MmdSparseMorphAttributeState {
  readonly name: string;
  readonly attribute: THREE.BufferAttribute;
  readonly morphAttributes: THREE.BufferAttribute[] | undefined;
  readonly hadMorphAttributes: boolean;
}

interface MmdWebGpuRenderer {
  readonly backend?: { readonly isWebGPUBackend?: boolean };
  compute(node: THREE.Node | THREE.Node[]): Promise<void> | undefined;
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
  const weights = new Float32Array(morphs.length);
  const weightsAttributes: THREE.BufferAttribute[] = [];
  const storageAttributes: THREE.BufferAttribute[] = [];
  const computeNodes: THREE.Node[] = [];
  const replacedAttributes: MmdSparseMorphAttributeState[] = [];
  const packedPosition = packMmdPositionMorphsToVertexCsr(vertexCount, morphs);
  if (packedPosition.morphIndices.length > 0) {
    const output = createSparseMorphCompute(position as THREE.BufferAttribute, packedPosition, weights, "vec3");
    replacedAttributes.push(captureSparseMorphAttribute(mesh.geometry, "position", position as THREE.BufferAttribute));
    mesh.geometry.setAttribute("position", output.attribute);
    mesh.geometry.morphAttributes.position = [];
    computeNodes.push(output.computeNode);
    weightsAttributes.push(output.weightsAttribute);
    storageAttributes.push(...output.storageAttributes);
  }
  const uv = mesh.geometry.getAttribute("uv");
  if (uv?.array instanceof Float32Array) {
    appendUvCompute(
      mesh.geometry,
      "uv",
      uv as THREE.BufferAttribute,
      packMmdUvMorphsToVertexCsr(vertexCount, morphs),
      weights,
      computeNodes,
      weightsAttributes,
      storageAttributes,
      replacedAttributes
    );
  }
  for (let uvIndex = 0; uvIndex < 4; uvIndex += 1) {
    const attributeName = `uv${uvIndex + 1}`;
    const attribute = mesh.geometry.getAttribute(attributeName);
    if (attribute?.array instanceof Float32Array) {
      appendUvCompute(
        mesh.geometry,
        attributeName,
        attribute as THREE.BufferAttribute,
        packMmdUvMorphsToVertexCsr(vertexCount, morphs, uvIndex),
        weights,
        computeNodes,
        weightsAttributes,
        storageAttributes,
        replacedAttributes
      );
    }
  }
  if (computeNodes.length === 0) return false;
  sparsePositionMorphStates.set(mesh, {
    computeNodes,
    weights,
    weightsAttributes,
    storageAttributes,
    replacedAttributes
  });
  return true;
}

/** Restores the replaced dense attributes and disposes the public compute nodes. */
export function disposeMmdTslSparsePositionMorphs(mesh: THREE.SkinnedMesh): boolean {
  const state = sparsePositionMorphStates.get(mesh);
  if (!state) {
    return false;
  }
  const morphAttributes = mesh.geometry.morphAttributes as Record<string, THREE.BufferAttribute[] | undefined>;
  for (const replacedAttribute of state.replacedAttributes) {
    mesh.geometry.setAttribute(replacedAttribute.name, replacedAttribute.attribute);
    if (replacedAttribute.hadMorphAttributes) {
      morphAttributes[replacedAttribute.name] = replacedAttribute.morphAttributes;
    } else {
      delete morphAttributes[replacedAttribute.name];
    }
  }
  // Node.dispose() is the supported Three.js lifecycle hook for compute-node
  // bindings and pipelines. StorageBufferAttribute has no public dispose API;
  // after restoring the geometry and dropping this state, those temporary
  // attributes are no longer strongly reachable by this integration.
  for (const computeNode of state.computeNodes) {
    computeNode.dispose();
  }
  for (const storageAttribute of state.storageAttributes) {
    storageAttribute.dispose();
  }
  state.computeNodes.length = 0;
  state.weightsAttributes.length = 0;
  state.storageAttributes.length = 0;
  state.replacedAttributes.length = 0;
  sparsePositionMorphStates.delete(mesh);
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
  for (const attribute of state.weightsAttributes) {
    attribute.needsUpdate = true;
  }
  const onlyComputeNode = state.computeNodes[0];
  renderer.compute(state.computeNodes.length === 1 && onlyComputeNode ? onlyComputeNode : state.computeNodes);
  return true;
}

function appendUvCompute(
  geometry: THREE.BufferGeometry,
  attributeName: string,
  base: THREE.BufferAttribute,
  packed: MmdPositionMorphCsr,
  weights: Float32Array,
  computeNodes: THREE.Node[],
  weightsAttributes: THREE.BufferAttribute[],
  storageAttributes: THREE.BufferAttribute[],
  replacedAttributes: MmdSparseMorphAttributeState[]
): void {
  if (packed.morphIndices.length === 0) return;
  const nodeType = base.itemSize === 2 ? "vec2" : "vec4";
  const output = createSparseMorphCompute(base, packed, weights, nodeType);
  replacedAttributes.push(captureSparseMorphAttribute(geometry, attributeName, base));
  geometry.setAttribute(attributeName, output.attribute);
  (geometry.morphAttributes as Record<string, THREE.BufferAttribute[]>)[attributeName] = [];
  computeNodes.push(output.computeNode);
  weightsAttributes.push(output.weightsAttribute);
  storageAttributes.push(...output.storageAttributes);
}

function captureSparseMorphAttribute(
  geometry: THREE.BufferGeometry,
  name: string,
  attribute: THREE.BufferAttribute
): MmdSparseMorphAttributeState {
  return {
    name,
    attribute,
    morphAttributes: (geometry.morphAttributes as Record<string, THREE.BufferAttribute[]>)[name],
    hadMorphAttributes: Object.prototype.hasOwnProperty.call(geometry.morphAttributes, name)
  };
}

/** Zero-vector constructors keyed by TSL node type, used to seed the per-vertex accumulator. */
const zeroVectorByNodeType = {
  vec2: () => TSL.vec2(0),
  vec3: () => TSL.vec3(0),
  vec4: () => TSL.vec4(0)
} as const;

// TSL.attributeArray is overloaded per literal node-type string; a union-typed
// nodeType parameter can't select an overload directly, so this lookup table
// pins each branch to its own literal call (same runtime behavior as the
// former per-arity functions, just keyed instead of triplicated).
const vecAttributeArrayByNodeType = {
  vec2: (count: number | Float32Array) => TSL.attributeArray(count, "vec2"),
  vec3: (count: number | Float32Array) => TSL.attributeArray(count, "vec3"),
  vec4: (count: number | Float32Array) => TSL.attributeArray(count, "vec4")
} as const;

function createSparseMorphCompute(
  base: THREE.BufferAttribute,
  packed: MmdPositionMorphCsr,
  weights: Float32Array,
  nodeType: "vec2" | "vec3" | "vec4"
): {
  readonly attribute: THREE.BufferAttribute;
  readonly computeNode: THREE.Node;
  readonly weightsAttribute: THREE.BufferAttribute;
  readonly storageAttributes: THREE.BufferAttribute[];
} {
  const makeVecAttributeArray = vecAttributeArrayByNodeType[nodeType];
  const weightStorage = TSL.attributeArray(weights, "float");
  const baseStorage = makeVecAttributeArray(base.array as Float32Array);
  const rowOffsetStorage = TSL.attributeArray(packed.rowOffsets, "uint");
  const morphIndexStorage = TSL.attributeArray(packed.morphIndices, "uint");
  const valueStorage = makeVecAttributeArray(packed.values);
  const baseValues = baseStorage.toReadOnly();
  const rowOffsets = rowOffsetStorage.toReadOnly();
  const morphIndices = morphIndexStorage.toReadOnly();
  const values = valueStorage.toReadOnly();
  const outputValues = makeVecAttributeArray(base.count);
  const makeZeroVector = zeroVectorByNodeType[nodeType];
  const computeNode = TSL.Fn(() => {
    const vertexIndex = TSL.instanceIndex;
    const delta = makeZeroVector().toVar();
    TSL.Loop(
      { start: rowOffsets.element(vertexIndex), end: rowOffsets.element(vertexIndex.add(1)), type: "uint", condition: "<" },
      ({ i }) => {
        const entryMorphIndex = morphIndices.element(i);
        delta.addAssign(values.element(i).mul(weightStorage.element(entryMorphIndex)));
      }
    );
    outputValues.element(vertexIndex).assign(baseValues.element(vertexIndex).add(delta));
  })().compute(base.count);
  return {
    attribute: outputValues.value as THREE.BufferAttribute,
    computeNode,
    weightsAttribute: weightStorage.value as THREE.BufferAttribute,
    storageAttributes: [
      weightStorage.value,
      baseStorage.value,
      rowOffsetStorage.value,
      morphIndexStorage.value,
      valueStorage.value,
      outputValues.value
    ] as THREE.BufferAttribute[]
  };
}
