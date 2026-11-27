import type { SparsePositionMorphOffsets } from "../parser/model/denseMorphProvider.js";
import type { ThreeMmdGeometryBuffers, ThreeMmdGeometryMaterial, ThreeMmdMaterialGroup } from "./geometry.js";
import { getDenseMorphProvider, type ThreeMmdGeometryMorph } from "./geometry-morph.js";

export function validateGeometryInput(
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

  if (buffers.qdef) {
    validateBufferLength("QDEF_ENABLED", buffers.qdef.enabled.length, vertexCount);
    validateFiniteBuffer("QDEF_ENABLED", buffers.qdef.enabled);
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
    const sparse = getDenseMorphProvider(morph)?.sparsePositionOffsets;
    if (sparse) {
      validateSparsePositionMorphOffsets(sparse, morphIndex, vertexCount);
    } else {
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
    }
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

function validateSparsePositionMorphOffsets(
  sparse: SparsePositionMorphOffsets,
  morphIndex: number,
  vertexCount: number
): void {
  const { vertexIndices, positions, start, count } = sparse;
  if (start + count > vertexIndices.length || positions.length !== vertexIndices.length * 3) {
    throw new RangeError(`THREE_MMD_GEOMETRY_MORPH_POSITION_TYPED_SPAN_INVALID:${morphIndex}`);
  }
  for (let offsetIndex = 0; offsetIndex < count; offsetIndex += 1) {
    const sourceIndex = start + offsetIndex;
    validateVertexIndex(
      `MORPH_VERTEX:${morphIndex}:${offsetIndex}`,
      vertexIndices[sourceIndex] ?? 0,
      vertexCount
    );
    const positionIndex = sourceIndex * 3;
    if (
      !Number.isFinite(positions[positionIndex]) ||
      !Number.isFinite(positions[positionIndex + 1]) ||
      !Number.isFinite(positions[positionIndex + 2])
    ) {
      throw new RangeError(
        `THREE_MMD_GEOMETRY_MORPH_POSITION_INVALID:${morphIndex}:${offsetIndex}`
      );
    }
  }
}
