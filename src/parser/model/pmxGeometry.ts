import type { BinaryReader } from "../binary/index.js";
import type { GeometryBuffers, QdefGeometryBuffers } from "./modelTypes.js";
import type { PmxIndexSizes } from "./pmxBinary.js";
import { maxPmxSectionCount, readVec3 } from "./pmxBinary.js";

interface PmxVertexBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  additionalUvs: Float32Array[];
  skinIndices: Uint16Array;
  skinWeights: Float32Array;
  edgeScale: Float32Array;
  sdef: NonNullable<GeometryBuffers["sdef"]>;
  sdefVertexCount: number;
  qdef: QdefGeometryBuffers;
  qdefVertexCount: number;
}

export function readVerticesWithBoneIndexSizeFallback(
  reader: BinaryReader,
  vertexCount: number,
  additionalUvCount: number,
  indexSizes: PmxIndexSizes
): PmxVertexBuffers {
  const startOffset = reader.offset;
  const candidateBoneIndexSizes = uniqueNumbers([indexSizes.bone, 1, 2, 4]);
  let lastError: unknown;

  for (const boneIndexSize of candidateBoneIndexSizes) {
    reader.offset = startOffset;
    const candidateIndexSizes = { ...indexSizes, bone: boneIndexSize };
    const buffers = createPmxVertexBuffers(vertexCount, additionalUvCount);
    try {
      for (let i = 0; i < vertexCount; i++) {
        const weightType = readVertex(
          reader,
          additionalUvCount,
          candidateIndexSizes,
          buffers.positions,
          buffers.normals,
          buffers.uvs,
          buffers.additionalUvs,
          buffers.skinIndices,
          buffers.skinWeights,
          buffers.edgeScale,
          buffers.sdef,
          buffers.qdef,
          i
        );
        if (weightType === 3) {
          buffers.sdefVertexCount += 1;
        }
        if (weightType === 4) {
          buffers.qdefVertexCount += 1;
        }
      }
      if (isPostVertexSectionPlausible(reader, indexSizes)) {
        return buffers;
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid PMX ")) {
        throw error;
      }
      lastError = error;
    }
  }

  reader.offset = startOffset;
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Unable to read PMX vertex payload");
}

export function skipVerticesWithBoneIndexSizeFallback(
  reader: BinaryReader,
  vertexCount: number,
  additionalUvCount: number,
  indexSizes: PmxIndexSizes
): PmxVertexBuffers {
  const startOffset = reader.offset;
  const candidateBoneIndexSizes = uniqueNumbers([indexSizes.bone, 1, 2, 4]);
  let lastError: unknown;

  for (const boneIndexSize of candidateBoneIndexSizes) {
    reader.offset = startOffset;
    const candidateIndexSizes = { ...indexSizes, bone: boneIndexSize };
    try {
      for (let i = 0; i < vertexCount; i++) {
        skipVertex(reader, additionalUvCount, candidateIndexSizes);
      }
      if (isPostVertexSectionPlausible(reader, indexSizes)) {
        return createSkippedPmxVertexBuffers();
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid PMX ")) {
        throw error;
      }
      lastError = error;
    }
  }

  reader.offset = startOffset;
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Unable to read PMX vertex payload");
}

export function minimumPmxVertexByteLength(additionalUvCount: number, boneIndexSize: number): number {
  return 3 * 4 + 3 * 4 + 2 * 4 + additionalUvCount * 4 * 4 + 1 + boneIndexSize + 4;
}

function createPmxVertexBuffers(
  vertexCount: number,
  additionalUvCount: number
): PmxVertexBuffers {
  return {
    positions: new Float32Array(vertexCount * 3),
    normals: new Float32Array(vertexCount * 3),
    uvs: new Float32Array(vertexCount * 2),
    additionalUvs: Array.from(
      { length: additionalUvCount },
      () => new Float32Array(vertexCount * 4)
    ),
    skinIndices: new Uint16Array(vertexCount * 4),
    skinWeights: new Float32Array(vertexCount * 4),
    edgeScale: new Float32Array(vertexCount),
    sdef: {
      enabled: new Float32Array(vertexCount),
      c: new Float32Array(vertexCount * 3),
      r0: new Float32Array(vertexCount * 3),
      r1: new Float32Array(vertexCount * 3),
      rw0: new Float32Array(vertexCount * 3),
      rw1: new Float32Array(vertexCount * 3)
    },
    sdefVertexCount: 0,
    qdef: {
      enabled: new Float32Array(vertexCount)
    },
    qdefVertexCount: 0
  };
}

function createSkippedPmxVertexBuffers(): PmxVertexBuffers {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    additionalUvs: [],
    skinIndices: new Uint16Array(0),
    skinWeights: new Float32Array(0),
    edgeScale: new Float32Array(0),
    sdef: {
      enabled: new Float32Array(0),
      c: new Float32Array(0),
      r0: new Float32Array(0),
      r1: new Float32Array(0),
      rw0: new Float32Array(0),
      rw1: new Float32Array(0)
    },
    sdefVertexCount: 0,
    qdef: { enabled: new Float32Array(0) },
    qdefVertexCount: 0
  };
}

function skipVertex(
  reader: BinaryReader,
  additionalUvCount: number,
  sizes: PmxIndexSizes
): void {
  reader.skip(3 * 4 + 3 * 4 + 2 * 4 + additionalUvCount * 4 * 4);
  const weightType = reader.u8();
  switch (weightType) {
    case 0:
      reader.skip(sizes.bone);
      break;
    case 1:
      reader.skip(sizes.bone * 2 + 4);
      break;
    case 2:
    case 4:
      reader.skip(sizes.bone * 4 + 4 * 4);
      break;
    case 3:
      reader.skip(sizes.bone * 2 + 4 + 3 * 4 + 3 * 4 + 3 * 4);
      break;
    default:
      throw new Error(`Unsupported PMX vertex weight type: ${weightType}`);
  }
  reader.skip(4);
}

function readVertex(
  reader: BinaryReader,
  additionalUvCount: number,
  sizes: PmxIndexSizes,
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  additionalUvs: Float32Array[],
  skinIndices: Uint16Array,
  skinWeights: Float32Array,
  edgeScale: Float32Array,
  sdef: NonNullable<GeometryBuffers["sdef"]>,
  qdef: QdefGeometryBuffers,
  index: number
): number {
  const positionOffset = index * 3;
  positions[positionOffset] = reader.f32();
  positions[positionOffset + 1] = reader.f32();
  positions[positionOffset + 2] = reader.f32();
  normals[positionOffset] = reader.f32();
  normals[positionOffset + 1] = reader.f32();
  normals[positionOffset + 2] = reader.f32();
  const uvOffset = index * 2;
  uvs[uvOffset] = reader.f32();
  uvs[uvOffset + 1] = reader.f32();
  for (let i = 0; i < additionalUvCount; i++) {
    const additionalUvOffset = index * 4;
    const target = additionalUvs[i];
    target[additionalUvOffset] = reader.f32();
    target[additionalUvOffset + 1] = reader.f32();
    target[additionalUvOffset + 2] = reader.f32();
    target[additionalUvOffset + 3] = reader.f32();
  }
  const skinOffset = index * 4;
  const weightType = reader.u8();
  switch (weightType) {
    case 0:
      skinIndices[skinOffset] = normalizeIndex(reader.index(sizes.bone));
      skinWeights[skinOffset] = 1;
      break;
    case 1:
    case 3: {
      skinIndices[skinOffset] = normalizeIndex(reader.index(sizes.bone));
      skinIndices[skinOffset + 1] = normalizeIndex(reader.index(sizes.bone));
      const weight = reader.f32();
      skinWeights[skinOffset] = weight;
      skinWeights[skinOffset + 1] = 1 - weight;
      if (weightType === 3) {
        readSdefParameters(reader, sdef, index, weight);
      }
      break;
    }
    case 2:
      for (let i = 0; i < 4; i++) {
        skinIndices[skinOffset + i] = normalizeIndex(reader.index(sizes.bone));
      }
      for (let i = 0; i < 4; i++) {
        skinWeights[skinOffset + i] = reader.f32();
      }
      break;
    case 4:
      for (let i = 0; i < 4; i++) {
        skinIndices[skinOffset + i] = normalizeIndex(reader.index(sizes.bone));
      }
      for (let i = 0; i < 4; i++) {
        skinWeights[skinOffset + i] = reader.f32();
      }
      qdef.enabled[index] = 1;
      break;
    default:
      throw new Error(`Unsupported PMX vertex weight type: ${weightType}`);
  }
  edgeScale[index] = reader.f32();
  return weightType;
}

function isPostVertexSectionPlausible(reader: BinaryReader, indexSizes: PmxIndexSizes): boolean {
  const vertexIndexCount = peekI32(reader, reader.offset);
  if (vertexIndexCount === undefined || vertexIndexCount < 0) {
    return false;
  }
  if (vertexIndexCount > maxPmxSectionCount) {
    throw new Error(`Invalid PMX vertex index count: ${vertexIndexCount}`);
  }

  const vertexIndexBytes = vertexIndexCount * indexSizes.vertex;
  if (!Number.isSafeInteger(vertexIndexBytes)) {
    return false;
  }

  const textureCountOffset = reader.offset + 4 + vertexIndexBytes;
  const textureCount = peekI32(reader, textureCountOffset);
  if (textureCount === undefined || textureCount < 0) {
    return false;
  }
  if (textureCount > maxPmxSectionCount) {
    throw new Error(`Invalid PMX texture count: ${textureCount}`);
  }

  const remainingAfterTextureCount = reader.view.byteLength - (textureCountOffset + 4);
  return textureCount * 4 <= remainingAfterTextureCount;
}

function peekI32(reader: BinaryReader, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > reader.view.byteLength) {
    return undefined;
  }
  return reader.view.getInt32(offset, true);
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function readSdefParameters(
  reader: BinaryReader,
  sdef: NonNullable<GeometryBuffers["sdef"]>,
  vertexIndex: number,
  boneWeight0: number
): void {
  const c = readVec3(reader);
  const r0 = readVec3(reader);
  const r1 = readVec3(reader);
  const offset = vertexIndex * 3;
  sdef.enabled[vertexIndex] = 1;
  sdef.c.set(c, offset);
  sdef.r0.set(r0, offset);
  sdef.r1.set(r1, offset);

  const boneWeight1 = 1 - boneWeight0;
  const rw: [number, number, number] = [
    r0[0] * boneWeight0 + r1[0] * boneWeight1,
    r0[1] * boneWeight0 + r1[1] * boneWeight1,
    r0[2] * boneWeight0 + r1[2] * boneWeight1
  ];
  const adjustedR0: [number, number, number] = [
    c[0] + r0[0] - rw[0],
    c[1] + r0[1] - rw[1],
    c[2] + r0[2] - rw[2]
  ];
  const adjustedR1: [number, number, number] = [
    c[0] + r1[0] - rw[0],
    c[1] + r1[1] - rw[1],
    c[2] + r1[2] - rw[2]
  ];
  sdef.rw0.set(
    [(c[0] + adjustedR0[0]) * 0.5, (c[1] + adjustedR0[1]) * 0.5, (c[2] + adjustedR0[2]) * 0.5],
    offset
  );
  sdef.rw1.set(
    [(c[0] + adjustedR1[0]) * 0.5, (c[1] + adjustedR1[1]) * 0.5, (c[2] + adjustedR1[2]) * 0.5],
    offset
  );
}

function normalizeIndex(index: number): number {
  return index < 0 ? 0 : index;
}
