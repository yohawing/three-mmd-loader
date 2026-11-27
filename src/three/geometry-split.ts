import type * as THREE from "three";

import {
  createMmdRenderOrderGroups,
  createThreeBufferGeometry,
  type ThreeMmdGeometryBuffers,
  type ThreeMmdGeometryMaterial,
  type ThreeMmdMaterialGroup
} from "./geometry.js";
import {
  getDenseMorphProvider,
  hasGeometryMorphOffsets,
  type ThreeMmdAdditionalUvMorphOffset,
  type ThreeMmdGeometryMorph,
  type ThreeMmdUvMorphOffset,
  type ThreeMmdVertexMorphOffset
} from "./geometry-morph.js";
import { validateGeometryInput } from "./geometry-validation.js";

export interface ThreeMmdMorphSplitGeometry {
  readonly geometry: THREE.BufferGeometry;
  readonly materialIndex: number;
  readonly morphTargetIndices: Uint16Array | Uint32Array;
  readonly sourceVertexCount: number;
  readonly vertexCount: number;
  readonly morphPositionAttributeCount: number;
}

export function createThreeMorphSplitGeometries(
  buffers: ThreeMmdGeometryBuffers,
  materials: readonly ThreeMmdGeometryMaterial[] = [],
  morphs: readonly ThreeMmdGeometryMorph[] = []
): ThreeMmdMorphSplitGeometry[] {
  validateGeometryInput(buffers, materials, morphs);
  const groups = createMmdRenderOrderGroups(buffers, materials);
  if (groups.length <= 1 || !morphs.some(hasGeometryMorphOffsets)) {
    return [];
  }

  const result: ThreeMmdMorphSplitGeometry[] = [];
  for (const group of groups) {
    const split = createMaterialSplitBuffers(buffers, group);
    const splitMorphs = createMaterialSplitMorphs(morphs, split.sourceToLocal, split.localToSource);
    const geometry = createThreeBufferGeometry(
      split.buffers,
      [{ faceCount: group.count / 3, materialIndex: group.materialIndex }],
      splitMorphs.morphs
    );
    geometry.clearGroups();
    geometry.addGroup(0, split.buffers.indices.length, group.materialIndex);
    geometry.userData.mmdMorphSplit = {
      materialIndex: group.materialIndex,
      sourceVertexCount: buffers.positions.length / 3,
      vertexCount: split.localToSource.length,
      sourceGroup: { ...group }
    };
    result.push({
      geometry,
      materialIndex: group.materialIndex,
      morphTargetIndices: splitMorphs.morphTargetIndices,
      sourceVertexCount: buffers.positions.length / 3,
      vertexCount: split.localToSource.length,
      morphPositionAttributeCount: geometry.morphAttributes.position?.length ?? 0
    });
  }
  return result;
}

function createMaterialSplitBuffers(
  buffers: ThreeMmdGeometryBuffers,
  group: ThreeMmdMaterialGroup
): {
  readonly buffers: ThreeMmdGeometryBuffers;
  readonly sourceToLocal: Int32Array;
  readonly localToSource: Uint32Array;
} {
  const sourceVertexCount = buffers.positions.length / 3;
  const sourceToLocal = new Int32Array(sourceVertexCount);
  sourceToLocal.fill(-1);
  const localVertices: number[] = [];
  for (let indexOffset = group.start; indexOffset < group.start + group.count; indexOffset += 1) {
    const sourceIndex = buffers.indices[indexOffset] ?? 0;
    if (sourceToLocal[sourceIndex] >= 0) {
      continue;
    }
    sourceToLocal[sourceIndex] = localVertices.length;
    localVertices.push(sourceIndex);
  }

  const localToSource = new Uint32Array(localVertices);
  const indexArray =
    localVertices.length > 65535
      ? new Uint32Array(group.count)
      : new Uint16Array(group.count);
  for (let indexOffset = 0; indexOffset < group.count; indexOffset += 1) {
    const sourceIndex = buffers.indices[group.start + indexOffset] ?? 0;
    indexArray[indexOffset] = sourceToLocal[sourceIndex];
  }

  const vertexCount = localVertices.length;
  const splitBuffers = {
    positions: copySplitFloatAttribute(buffers.positions, 3, localToSource),
    normals: copySplitFloatAttribute(buffers.normals, 3, localToSource),
    uvs: copySplitFloatAttribute(buffers.uvs, 2, localToSource),
    additionalUvs: buffers.additionalUvs?.map((additionalUv) =>
      copySplitFloatAttribute(additionalUv, 4, localToSource)
    ),
    indices: indexArray,
    skinIndices: copySplitUint16Attribute(buffers.skinIndices, 4, localToSource),
    skinWeights: copySplitFloatAttribute(buffers.skinWeights, 4, localToSource),
    edgeScale: buffers.edgeScale
      ? copySplitFloatAttribute(buffers.edgeScale, 1, localToSource)
      : undefined,
    sdef: buffers.sdef
      ? {
          enabled: copySplitFloatAttribute(buffers.sdef.enabled, 1, localToSource),
          c: copySplitFloatAttribute(buffers.sdef.c, 3, localToSource),
          r0: copySplitFloatAttribute(buffers.sdef.r0, 3, localToSource),
          r1: copySplitFloatAttribute(buffers.sdef.r1, 3, localToSource),
          rw0: copySplitFloatAttribute(buffers.sdef.rw0, 3, localToSource),
          rw1: copySplitFloatAttribute(buffers.sdef.rw1, 3, localToSource)
        }
      : undefined,
    qdef: buffers.qdef
      ? {
          enabled: copySplitFloatAttribute(buffers.qdef.enabled, 1, localToSource)
        }
      : undefined,
    materialGroups: [{ start: 0, count: group.count, materialIndex: group.materialIndex }]
  } satisfies ThreeMmdGeometryBuffers;
  if (vertexCount === 0) {
    throw new RangeError(`THREE_MMD_GEOMETRY_MATERIAL_GROUP_EMPTY:${group.materialIndex}`);
  }
  return { buffers: splitBuffers, sourceToLocal, localToSource };
}

function copySplitFloatAttribute(
  source: Float32Array,
  itemSize: number,
  localToSource: Uint32Array
): Float32Array {
  const target = new Float32Array(localToSource.length * itemSize);
  for (let localIndex = 0; localIndex < localToSource.length; localIndex += 1) {
    const sourceIndex = localToSource[localIndex] ?? 0;
    const sourceBase = sourceIndex * itemSize;
    const targetBase = localIndex * itemSize;
    for (let component = 0; component < itemSize; component += 1) {
      target[targetBase + component] = source[sourceBase + component] ?? 0;
    }
  }
  return target;
}

function copySplitUint16Attribute(
  source: Uint16Array,
  itemSize: number,
  localToSource: Uint32Array
): Uint16Array {
  const target = new Uint16Array(localToSource.length * itemSize);
  for (let localIndex = 0; localIndex < localToSource.length; localIndex += 1) {
    const sourceIndex = localToSource[localIndex] ?? 0;
    const sourceBase = sourceIndex * itemSize;
    const targetBase = localIndex * itemSize;
    for (let component = 0; component < itemSize; component += 1) {
      target[targetBase + component] = source[sourceBase + component] ?? 0;
    }
  }
  return target;
}

function createMaterialSplitMorphs(
  morphs: readonly ThreeMmdGeometryMorph[],
  sourceToLocal: Int32Array,
  localToSource: Uint32Array
): {
  readonly morphs: ThreeMmdGeometryMorph[];
  readonly morphTargetIndices: Uint16Array | Uint32Array;
} {
  const splitMorphs: ThreeMmdGeometryMorph[] = [];
  const morphTargetIndices =
    morphs.length > 65535 ? new Uint32Array(morphs.length) : new Uint16Array(morphs.length);
  let splitIndex = 0;
  for (let morphIndex = 0; morphIndex < morphs.length; morphIndex += 1) {
    const morph = morphs[morphIndex];
    if (!morph) {
      continue;
    }
    const splitMorph: ThreeMmdGeometryMorph = {
      vertexOffsets: splitVertexOffsets(morph, sourceToLocal, localToSource),
      uvOffsets: splitUvOffsets(morph, sourceToLocal, localToSource),
      additionalUvOffsets: splitAdditionalUvOffsets(morph, sourceToLocal, localToSource)
    };
    if (!hasGeometryMorphOffsets(splitMorph)) {
      continue;
    }
    splitMorphs.push(splitMorph);
    morphTargetIndices[splitIndex] = morphIndex;
    splitIndex += 1;
  }
  return {
    morphs: splitMorphs,
    morphTargetIndices: morphTargetIndices.slice(0, splitIndex)
  };
}

function splitVertexOffsets(
  morph: ThreeMmdGeometryMorph,
  sourceToLocal: Int32Array,
  localToSource: Uint32Array
): ThreeMmdVertexMorphOffset[] | undefined {
  const sparse = getDenseMorphProvider(morph)?.sparsePositionOffsets;
  if (sparse) {
    const offsets: ThreeMmdVertexMorphOffset[] = [];
    const { vertexIndices, positions, start, count } = sparse;
    for (let offsetIndex = 0; offsetIndex < count; offsetIndex += 1) {
      const sourceIndex = start + offsetIndex;
      const localIndex = sourceToLocal[vertexIndices[sourceIndex] ?? 0] ?? -1;
      if (localIndex >= 0) {
        const positionIndex = sourceIndex * 3;
        offsets.push({
          vertexIndex: localIndex,
          position: [
            positions[positionIndex] ?? 0,
            positions[positionIndex + 1] ?? 0,
            positions[positionIndex + 2] ?? 0
          ]
        });
      }
    }
    return offsets.length > 0 ? offsets : undefined;
  }
  if (morph.densePositionOffsets) {
    const offsets: ThreeMmdVertexMorphOffset[] = [];
    for (let localIndex = 0; localIndex < localToSource.length; localIndex += 1) {
      const sourceBase = (localToSource[localIndex] ?? 0) * 3;
      const x = morph.densePositionOffsets[sourceBase] ?? 0;
      const y = morph.densePositionOffsets[sourceBase + 1] ?? 0;
      const z = morph.densePositionOffsets[sourceBase + 2] ?? 0;
      if (x !== 0 || y !== 0 || z !== 0) {
        offsets.push({ vertexIndex: localIndex, position: [x, y, z] });
      }
    }
    return offsets.length > 0 ? offsets : undefined;
  }
  if (!morph.vertexOffsets?.length) {
    return undefined;
  }
  const offsets: ThreeMmdVertexMorphOffset[] = [];
  for (const offset of morph.vertexOffsets) {
    const localIndex = sourceToLocal[offset.vertexIndex] ?? -1;
    if (localIndex >= 0) {
      offsets.push({ vertexIndex: localIndex, position: offset.position });
    }
  }
  return offsets.length > 0 ? offsets : undefined;
}

function splitUvOffsets(
  morph: ThreeMmdGeometryMorph,
  sourceToLocal: Int32Array,
  localToSource: Uint32Array
): ThreeMmdUvMorphOffset[] | undefined {
  if (morph.denseUvOffsets) {
    const offsets: ThreeMmdUvMorphOffset[] = [];
    for (let localIndex = 0; localIndex < localToSource.length; localIndex += 1) {
      const sourceBase = (localToSource[localIndex] ?? 0) * 2;
      const u = morph.denseUvOffsets[sourceBase] ?? 0;
      const v = morph.denseUvOffsets[sourceBase + 1] ?? 0;
      if (u !== 0 || v !== 0) {
        offsets.push({ vertexIndex: localIndex, uv: [u, v, 0, 0] });
      }
    }
    return offsets.length > 0 ? offsets : undefined;
  }
  if (!morph.uvOffsets?.length) {
    return undefined;
  }
  const offsets: ThreeMmdUvMorphOffset[] = [];
  for (const offset of morph.uvOffsets) {
    const localIndex = sourceToLocal[offset.vertexIndex] ?? -1;
    if (localIndex >= 0) {
      offsets.push({ vertexIndex: localIndex, uv: offset.uv });
    }
  }
  return offsets.length > 0 ? offsets : undefined;
}

function splitAdditionalUvOffsets(
  morph: ThreeMmdGeometryMorph,
  sourceToLocal: Int32Array,
  localToSource: Uint32Array
): ThreeMmdAdditionalUvMorphOffset[] | undefined {
  const offsets: ThreeMmdAdditionalUvMorphOffset[] = [];
  morph.denseAdditionalUvOffsets?.forEach((denseOffsets, uvIndex) => {
    if (!denseOffsets) {
      return;
    }
    for (let localIndex = 0; localIndex < localToSource.length; localIndex += 1) {
      const sourceBase = (localToSource[localIndex] ?? 0) * 4;
      const x = denseOffsets[sourceBase] ?? 0;
      const y = denseOffsets[sourceBase + 1] ?? 0;
      const z = denseOffsets[sourceBase + 2] ?? 0;
      const w = denseOffsets[sourceBase + 3] ?? 0;
      if (x !== 0 || y !== 0 || z !== 0 || w !== 0) {
        offsets.push({ vertexIndex: localIndex, uvIndex, uv: [x, y, z, w] });
      }
    }
  });
  for (const offset of morph.additionalUvOffsets ?? []) {
    const localIndex = sourceToLocal[offset.vertexIndex] ?? -1;
    if (localIndex >= 0) {
      offsets.push({ vertexIndex: localIndex, uvIndex: offset.uvIndex, uv: offset.uv });
    }
  }
  return offsets.length > 0 ? offsets : undefined;
}
