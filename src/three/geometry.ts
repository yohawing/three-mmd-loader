import * as THREE from "three";

import {
  denseMorphProviderSymbol,
  type DenseMorphProvider
} from "../parser/model/denseMorphProvider.js";
import { computeMmdMaterialRenderOrder } from "./material/material-metadata.js";
import type { MmdMaterialTransparencyMode } from "./textures.js";

export interface ThreeMmdMaterialGroup {
  readonly start: number;
  readonly count: number;
  readonly materialIndex: number;
}

export interface ThreeMmdGeometryMaterial {
  readonly faceCount: number;
  readonly materialIndex?: number;
  readonly transparencyMode?: MmdMaterialTransparencyMode;
}

export interface ThreeMmdSdefBuffers {
  readonly enabled: Float32Array;
  readonly c: Float32Array;
  readonly r0: Float32Array;
  readonly r1: Float32Array;
  readonly rw0: Float32Array;
  readonly rw1: Float32Array;
}

export interface ThreeMmdGeometryBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly additionalUvs?: readonly Float32Array[];
  readonly skinIndices: Uint16Array;
  readonly skinWeights: Float32Array;
  readonly edgeScale?: Float32Array;
  readonly sdef?: ThreeMmdSdefBuffers;
  readonly materialGroups?: readonly ThreeMmdMaterialGroup[];
}

export interface ThreeMmdVertexMorphOffset {
  readonly vertexIndex: number;
  readonly position: readonly [number, number, number];
}

export interface ThreeMmdUvMorphOffset {
  readonly vertexIndex: number;
  readonly uv: readonly [number, number, number?, number?];
}

export interface ThreeMmdAdditionalUvMorphOffset {
  readonly vertexIndex: number;
  readonly uvIndex: number;
  readonly uv: readonly [number, number, number, number];
}

export interface ThreeMmdGeometryMorph {
  readonly vertexOffsets?: readonly ThreeMmdVertexMorphOffset[];
  readonly densePositionOffsets?: Float32Array;
  readonly uvOffsets?: readonly ThreeMmdUvMorphOffset[];
  readonly denseUvOffsets?: Float32Array;
  readonly additionalUvOffsets?: readonly ThreeMmdAdditionalUvMorphOffset[];
  readonly denseAdditionalUvOffsets?: readonly (Float32Array | undefined)[];
}

type DenseProviderMorph = ThreeMmdGeometryMorph & {
  readonly [denseMorphProviderSymbol]?: DenseMorphProvider;
};

export function createThreeBufferGeometry(
  buffers: ThreeMmdGeometryBuffers,
  materials: readonly ThreeMmdGeometryMaterial[] = [],
  morphs: readonly ThreeMmdGeometryMorph[] = []
): THREE.BufferGeometry {
  validateGeometryInput(buffers, materials, morphs);

  const positions = new Float32Array(buffers.positions.length);
  const normals = new Float32Array(buffers.normals.length);
  for (let i = 0; i < buffers.positions.length; i += 3) {
    positions[i] = buffers.positions[i];
    positions[i + 1] = buffers.positions[i + 1];
    positions[i + 2] = -buffers.positions[i + 2];
    normals[i] = buffers.normals[i];
    normals[i + 1] = buffers.normals[i + 1];
    normals[i + 2] = -buffers.normals[i + 2];
  }

  const indices =
    buffers.indices instanceof Uint32Array
      ? new Uint32Array(buffers.indices.length)
      : new Uint16Array(buffers.indices.length);
  for (let i = 0; i < buffers.indices.length; i += 3) {
    indices[i] = buffers.indices[i];
    indices[i + 1] = buffers.indices[i + 2];
    indices[i + 2] = buffers.indices[i + 1];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(buffers.uvs.slice(), 2));

  if (buffers.edgeScale) {
    geometry.setAttribute("mmdEdgeScale", new THREE.BufferAttribute(buffers.edgeScale.slice(), 1));
    geometry.userData.mmdEdgeScale = { vertexCount: buffers.edgeScale.length };
  }

  const additionalUvs = buffers.additionalUvs ?? [];
  additionalUvs.forEach((additionalUv, index) => {
    geometry.setAttribute(`uv${index + 1}`, new THREE.BufferAttribute(additionalUv.slice(), 4));
  });

  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(buffers.skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(buffers.skinWeights, 4));

  if (buffers.sdef) {
    geometry.setAttribute(
      "matricesSdefEnabled",
      new THREE.BufferAttribute(buffers.sdef.enabled.slice(), 1)
    );
    geometry.setAttribute(
      "matricesSdefC",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.c), 3)
    );
    geometry.setAttribute(
      "matricesSdefR0",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.r0), 3)
    );
    geometry.setAttribute(
      "matricesSdefR1",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.r1), 3)
    );
    geometry.setAttribute(
      "matricesSdefRW0",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.rw0), 3)
    );
    geometry.setAttribute(
      "matricesSdefRW1",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.rw1), 3)
    );
    geometry.userData.mmdSdef = { vertexCount: buffers.sdef.c.length / 3 };
  }

  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  if (morphs.length > 0) {
    const morphAttributes = geometry.morphAttributes as Record<string, THREE.BufferAttribute[]>;
    geometry.morphTargetsRelative = true;
    geometry.morphAttributes.position = morphs.map(
      (morph) =>
        new THREE.Float32BufferAttribute(
          createThreeMorphPositionOffsets(buffers.positions.length, morph),
          3
        )
    );
    morphAttributes.uv = morphs.map(
      (morph) =>
        new THREE.Float32BufferAttribute(createThreeMorphUvOffsets(buffers.uvs.length, morph), 2)
    );
    additionalUvs.forEach((additionalUv, index) => {
      morphAttributes[`uv${index + 1}`] = morphs.map(
        (morph) =>
          new THREE.Float32BufferAttribute(
            createThreeAdditionalMorphUvOffsets(additionalUv.length, index, morph),
            4
          )
      );
    });
  }

  createMmdRenderOrderGroups(buffers, materials).forEach((group) => {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  });

  geometry.computeBoundingSphere();
  return geometry;
}

function createMmdRenderOrderGroups(
  buffers: ThreeMmdGeometryBuffers,
  materials: readonly ThreeMmdGeometryMaterial[]
): ThreeMmdMaterialGroup[] {
  const groups = buffers.materialGroups?.length
    ? [...buffers.materialGroups]
    : createMaterialFaceCountGroups(materials);
  if (materials.length === 0 || groups.length <= 1) {
    return groups;
  }

  const renderOrderByMaterial = new Map(
    computeMmdMaterialRenderOrder(
      materials.map((material, fallbackIndex) => ({
        materialIndex: material.materialIndex ?? fallbackIndex,
        transparencyMode: material.transparencyMode ?? "opaque"
      }))
    ).map((entry) => [entry.materialIndex, entry.renderOrder])
  );
  return groups
    .map((group, sourceOrder) => ({ group, sourceOrder }))
    .sort((a, b) => {
      const aOrder = renderOrderByMaterial.get(a.group.materialIndex) ?? Number.POSITIVE_INFINITY;
      const bOrder = renderOrderByMaterial.get(b.group.materialIndex) ?? Number.POSITIVE_INFINITY;
      return aOrder - bOrder || a.sourceOrder - b.sourceOrder;
    })
    .map((entry) => entry.group);
}

function createMaterialFaceCountGroups(
  materials: readonly ThreeMmdGeometryMaterial[]
): ThreeMmdMaterialGroup[] {
  let groupStart = 0;
  return materials.map((material, materialIndex) => {
    const groupCount = material.faceCount * 3;
    const group = {
      start: groupStart,
      count: groupCount,
      materialIndex
    };
    groupStart += groupCount;
    return group;
  });
}

function validateGeometryInput(
  buffers: ThreeMmdGeometryBuffers,
  materials: readonly ThreeMmdGeometryMaterial[],
  morphs: readonly ThreeMmdGeometryMorph[]
): void {
  const vertexCount = validateBaseBuffers(buffers);
  validateMaterialGroups(buffers, materials);
  validateMorphs(morphs, vertexCount, buffers.additionalUvs?.length ?? 0);
}

function validateBaseBuffers(buffers: ThreeMmdGeometryBuffers): number {
  if (buffers.positions.length % 3 !== 0) {
    throw new RangeError(`THREE_MMD_GEOMETRY_POSITION_LENGTH_INVALID:${buffers.positions.length}`);
  }
  const vertexCount = buffers.positions.length / 3;

  validateBufferLength("NORMAL", buffers.normals.length, buffers.positions.length);
  validateBufferLength("UV", buffers.uvs.length, vertexCount * 2);
  validateBufferLength("SKIN_INDEX", buffers.skinIndices.length, vertexCount * 4);
  validateBufferLength("SKIN_WEIGHT", buffers.skinWeights.length, vertexCount * 4);
  if (buffers.indices.length % 3 !== 0) {
    throw new RangeError(`THREE_MMD_GEOMETRY_INDEX_LENGTH_INVALID:${buffers.indices.length}`);
  }

  validateFiniteBuffer("POSITION", buffers.positions);
  validateFiniteBuffer("NORMAL", buffers.normals);
  validateFiniteBuffer("UV", buffers.uvs);
  validateFiniteBuffer("SKIN_WEIGHT", buffers.skinWeights);
  validateIndexBuffer(buffers.indices, vertexCount);

  buffers.additionalUvs?.forEach((additionalUv, index) => {
    validateBufferLength(`ADDITIONAL_UV_${index}`, additionalUv.length, vertexCount * 4);
    validateFiniteBuffer(`ADDITIONAL_UV_${index}`, additionalUv);
  });

  if (buffers.edgeScale) {
    validateBufferLength("EDGE_SCALE", buffers.edgeScale.length, vertexCount);
    validateFiniteBuffer("EDGE_SCALE", buffers.edgeScale);
  }

  if (buffers.sdef) {
    validateBufferLength("SDEF_ENABLED", buffers.sdef.enabled.length, vertexCount);
    validateBufferLength("SDEF_C", buffers.sdef.c.length, vertexCount * 3);
    validateBufferLength("SDEF_R0", buffers.sdef.r0.length, vertexCount * 3);
    validateBufferLength("SDEF_R1", buffers.sdef.r1.length, vertexCount * 3);
    validateBufferLength("SDEF_RW0", buffers.sdef.rw0.length, vertexCount * 3);
    validateBufferLength("SDEF_RW1", buffers.sdef.rw1.length, vertexCount * 3);
    validateFiniteBuffer("SDEF_ENABLED", buffers.sdef.enabled);
    validateFiniteBuffer("SDEF_C", buffers.sdef.c);
    validateFiniteBuffer("SDEF_R0", buffers.sdef.r0);
    validateFiniteBuffer("SDEF_R1", buffers.sdef.r1);
    validateFiniteBuffer("SDEF_RW0", buffers.sdef.rw0);
    validateFiniteBuffer("SDEF_RW1", buffers.sdef.rw1);
  }

  return vertexCount;
}

function validateMaterialGroups(
  buffers: ThreeMmdGeometryBuffers,
  materials: readonly ThreeMmdGeometryMaterial[]
): void {
  buffers.materialGroups?.forEach((group, index) => {
    validateNonNegativeInteger(`MATERIAL_GROUP_START:${index}`, group.start);
    validateNonNegativeInteger(`MATERIAL_GROUP_COUNT:${index}`, group.count);
    validateNonNegativeInteger(`MATERIAL_GROUP_INDEX:${index}`, group.materialIndex);
    if (
      group.start % 3 !== 0 ||
      group.count % 3 !== 0 ||
      group.start + group.count > buffers.indices.length
    ) {
      throw new RangeError(
        `THREE_MMD_GEOMETRY_MATERIAL_GROUP_RANGE_INVALID:${index}:${group.start}:${group.count}`
      );
    }
  });
  if (buffers.materialGroups?.length) {
    validateMaterialGroupCoverage(buffers.materialGroups, buffers.indices.length);
  }

  let derivedGroupCount = 0;
  materials.forEach((material, index) => {
    validateNonNegativeInteger(`MATERIAL_FACE_COUNT:${index}`, material.faceCount);
    derivedGroupCount += material.faceCount * 3;
  });
  if (
    !buffers.materialGroups?.length &&
    materials.length > 0 &&
    derivedGroupCount !== buffers.indices.length
  ) {
    throw new RangeError(
      `THREE_MMD_GEOMETRY_MATERIAL_FACE_COUNT_MISMATCH:${derivedGroupCount}:${buffers.indices.length}`
    );
  }
}

function validateMaterialGroupCoverage(
  groups: readonly ThreeMmdMaterialGroup[],
  indexCount: number
): void {
  const covered = new Uint8Array(indexCount);
  groups.forEach((group, groupIndex) => {
    for (let index = group.start; index < group.start + group.count; index += 1) {
      if (covered[index]) {
        throw new RangeError(`THREE_MMD_GEOMETRY_MATERIAL_GROUP_OVERLAP:${groupIndex}:${index}`);
      }
      covered[index] = 1;
    }
  });

  const gapIndex = covered.indexOf(0);
  if (gapIndex >= 0) {
    throw new RangeError(`THREE_MMD_GEOMETRY_MATERIAL_GROUP_GAP:${gapIndex}`);
  }
}

function validateMorphs(
  morphs: readonly ThreeMmdGeometryMorph[],
  vertexCount: number,
  additionalUvCount: number
): void {
  morphs.forEach((morph, morphIndex) => {
    morph.vertexOffsets?.forEach((offset, offsetIndex) => {
      validateVertexIndex(
        `MORPH_VERTEX:${morphIndex}:${offsetIndex}`,
        offset.vertexIndex,
        vertexCount
      );
      validateTuple(
        `THREE_MMD_GEOMETRY_MORPH_POSITION_INVALID:${morphIndex}:${offsetIndex}`,
        offset.position,
        3
      );
    });
    validateDenseMorphBuffer(
      `THREE_MMD_GEOMETRY_MORPH_POSITION_DENSE_INVALID:${morphIndex}`,
      morph.densePositionOffsets,
      vertexCount * 3
    );

    morph.uvOffsets?.forEach((offset, offsetIndex) => {
      validateVertexIndex(`MORPH_UV:${morphIndex}:${offsetIndex}`, offset.vertexIndex, vertexCount);
      validateTuple(
        `THREE_MMD_GEOMETRY_MORPH_UV_INVALID:${morphIndex}:${offsetIndex}`,
        offset.uv,
        2
      );
    });
    validateDenseMorphBuffer(
      `THREE_MMD_GEOMETRY_MORPH_UV_DENSE_INVALID:${morphIndex}`,
      morph.denseUvOffsets,
      vertexCount * 2
    );

    morph.additionalUvOffsets?.forEach((offset, offsetIndex) => {
      validateVertexIndex(
        `MORPH_ADDITIONAL_UV:${morphIndex}:${offsetIndex}`,
        offset.vertexIndex,
        vertexCount
      );
      if (
        !Number.isInteger(offset.uvIndex) ||
        offset.uvIndex < 0 ||
        offset.uvIndex >= additionalUvCount
      ) {
        throw new RangeError(
          `THREE_MMD_GEOMETRY_MORPH_ADDITIONAL_UV_INDEX_INVALID:${morphIndex}:${offsetIndex}:${offset.uvIndex}`
        );
      }
      validateTuple(
        `THREE_MMD_GEOMETRY_MORPH_ADDITIONAL_UV_INVALID:${morphIndex}:${offsetIndex}`,
        offset.uv,
        4
      );
    });
    morph.denseAdditionalUvOffsets?.forEach((offsets, uvIndex) => {
      if (uvIndex >= additionalUvCount) {
        throw new RangeError(
          `THREE_MMD_GEOMETRY_MORPH_ADDITIONAL_UV_DENSE_INDEX_INVALID:${morphIndex}:${uvIndex}`
        );
      }
      validateDenseMorphBuffer(
        `THREE_MMD_GEOMETRY_MORPH_ADDITIONAL_UV_DENSE_INVALID:${morphIndex}:${uvIndex}`,
        offsets,
        vertexCount * 4
      );
    });
  });
}

function validateBufferLength(name: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new RangeError(`THREE_MMD_GEOMETRY_${name}_LENGTH_INVALID:${actual}:${expected}`);
  }
}

function validateFiniteBuffer(name: string, values: Float32Array): void {
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      throw new TypeError(`THREE_MMD_GEOMETRY_${name}_NON_FINITE:${index}`);
    }
  });
}

function validateIndexBuffer(indices: Uint16Array | Uint32Array, vertexCount: number): void {
  indices.forEach((index, componentIndex) => {
    if (index >= vertexCount) {
      throw new RangeError(`THREE_MMD_GEOMETRY_INDEX_OUT_OF_RANGE:${componentIndex}:${index}`);
    }
  });
}

function validateNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`THREE_MMD_GEOMETRY_${name}_INVALID:${value}`);
  }
}

function validateVertexIndex(name: string, value: number, vertexCount: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= vertexCount) {
    throw new RangeError(`THREE_MMD_GEOMETRY_${name}_INDEX_INVALID:${value}`);
  }
}

function validateTuple(name: string, values: readonly unknown[], expectedLength: number): void {
  if (!Array.isArray(values) || values.length < expectedLength) {
    throw new TypeError(name);
  }
  for (let index = 0; index < expectedLength; index += 1) {
    if (typeof values[index] !== "number" || !Number.isFinite(values[index])) {
      throw new TypeError(`${name}:${index}`);
    }
  }
}

function validateDenseMorphBuffer(
  name: string,
  values: Float32Array | undefined,
  expectedLength: number
): void {
  if (!values) {
    return;
  }
  if (values.length !== expectedLength) {
    throw new RangeError(`${name}:${values.length}:${expectedLength}`);
  }
  validateFiniteBuffer(name, values);
}

function createThreeVec3Buffer(values: Float32Array): Float32Array {
  const converted = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 3) {
    converted[i] = values[i];
    converted[i + 1] = values[i + 1];
    converted[i + 2] = -values[i + 2];
  }
  return converted;
}

function createThreeMorphPositionOffsets(
  positionLength: number,
  morph: ThreeMmdGeometryMorph
): Float32Array {
  const providerOffsets = getDenseMorphProvider(morph)?.createPositionOffsets(positionLength / 3);
  if (providerOffsets) {
    return providerOffsets;
  }
  if (morph.densePositionOffsets) {
    return morph.densePositionOffsets.slice();
  }
  const offsets = new Float32Array(positionLength);
  for (const offset of morph.vertexOffsets ?? []) {
    const base = offset.vertexIndex * 3;
    offsets[base] = offset.position[0];
    offsets[base + 1] = offset.position[1];
    offsets[base + 2] = -offset.position[2];
  }
  return offsets;
}

function createThreeMorphUvOffsets(uvLength: number, morph: ThreeMmdGeometryMorph): Float32Array {
  const providerOffsets = getDenseMorphProvider(morph)?.createUvOffsets(uvLength / 2);
  if (providerOffsets) {
    return providerOffsets;
  }
  if (morph.denseUvOffsets) {
    return morph.denseUvOffsets.slice();
  }
  const offsets = new Float32Array(uvLength);
  for (const offset of morph.uvOffsets ?? []) {
    const base = offset.vertexIndex * 2;
    offsets[base] = offset.uv[0];
    offsets[base + 1] = offset.uv[1];
  }
  return offsets;
}

function createThreeAdditionalMorphUvOffsets(
  uvLength: number,
  uvIndex: number,
  morph: ThreeMmdGeometryMorph
): Float32Array {
  const providerOffsets = getDenseMorphProvider(morph)?.createAdditionalUvOffsets(
    uvIndex,
    uvLength / 4
  );
  if (providerOffsets) {
    return providerOffsets;
  }
  const denseOffsets = morph.denseAdditionalUvOffsets?.[uvIndex];
  if (denseOffsets) {
    return denseOffsets.slice();
  }
  const offsets = new Float32Array(uvLength);
  for (const offset of morph.additionalUvOffsets ?? []) {
    if (offset.uvIndex !== uvIndex) {
      continue;
    }
    const base = offset.vertexIndex * 4;
    offsets[base] = offset.uv[0];
    offsets[base + 1] = offset.uv[1];
    offsets[base + 2] = offset.uv[2];
    offsets[base + 3] = offset.uv[3];
  }
  return offsets;
}

function getDenseMorphProvider(morph: ThreeMmdGeometryMorph): DenseMorphProvider | undefined {
  return (morph as DenseProviderMorph)[denseMorphProviderSymbol];
}
