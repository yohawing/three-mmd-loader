import {
  denseMorphProviderSymbol,
  type DenseMorphProvider
} from "../parser/model/denseMorphProvider.js";
import type { ThreeMmdGeometryMorph } from "../three/geometry.js";

type DenseProviderMorph = ThreeMmdGeometryMorph & {
  readonly [denseMorphProviderSymbol]?: DenseMorphProvider;
};

export interface MmdPositionMorphCsr {
  readonly vertexCount: number;
  readonly morphCount: number;
  readonly rowOffsets: Uint32Array;
  readonly morphIndices: Uint32Array;
  readonly values: Float32Array;
}

export interface MmdUvMorphCsr extends MmdPositionMorphCsr {
  readonly componentCount: 2 | 4;
}

export function packMmdPositionMorphsToVertexCsr(
  vertexCount: number,
  morphs: readonly ThreeMmdGeometryMorph[]
): MmdPositionMorphCsr {
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 0) {
    throw new RangeError(`MMD_POSITION_MORPH_CSR_VERTEX_COUNT_INVALID:${vertexCount}`);
  }

  const denseByMorph = new Array<Float32Array | undefined>(morphs.length);
  const sparseByMorph = new Array<Map<number, readonly [number, number, number]> | undefined>(
    morphs.length
  );
  const entriesPerVertex = new Uint32Array(vertexCount);

  for (let morphIndex = 0; morphIndex < morphs.length; morphIndex += 1) {
    const morph = morphs[morphIndex];
    if (!morph) {
      continue;
    }
    const dense = resolveDensePositionOffsets(morph, vertexCount, morphIndex);
    if (dense) {
      denseByMorph[morphIndex] = dense;
      countDenseEntries(dense, entriesPerVertex);
      continue;
    }
    const sparse = normalizeSparsePositionOffsets(morph, vertexCount, morphIndex);
    if (sparse.size > 0) {
      sparseByMorph[morphIndex] = sparse;
      for (const [vertexIndex, position] of sparse) {
        if (hasNonZeroComponent(position)) {
          entriesPerVertex[vertexIndex] = (entriesPerVertex[vertexIndex] ?? 0) + 1;
        }
      }
    }
  }

  const rowOffsets = new Uint32Array(vertexCount + 1);
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    rowOffsets[vertexIndex + 1] = (rowOffsets[vertexIndex] ?? 0) + (entriesPerVertex[vertexIndex] ?? 0);
  }
  const entryCount = rowOffsets[vertexCount] ?? 0;
  const morphIndices = new Uint32Array(entryCount);
  const values = new Float32Array(entryCount * 3);
  const cursors = rowOffsets.slice(0, vertexCount);

  for (let morphIndex = 0; morphIndex < morphs.length; morphIndex += 1) {
    const dense = denseByMorph[morphIndex];
    if (dense) {
      writeDenseEntries(dense, morphIndex, cursors, morphIndices, values);
      continue;
    }
    const sparse = sparseByMorph[morphIndex];
    if (!sparse) {
      continue;
    }
    for (const [vertexIndex, position] of sparse) {
      if (!hasNonZeroComponent(position)) {
        continue;
      }
      writeEntry(
        vertexIndex,
        morphIndex,
        position[0],
        position[1],
        -position[2],
        cursors,
        morphIndices,
        values
      );
    }
  }

  return { vertexCount, morphCount: morphs.length, rowOffsets, morphIndices, values };
}

function resolveDensePositionOffsets(
  morph: ThreeMmdGeometryMorph,
  vertexCount: number,
  morphIndex: number
): Float32Array | undefined {
  const provider = (morph as DenseProviderMorph)[denseMorphProviderSymbol];
  const dense = provider?.createPositionOffsets(vertexCount) ?? morph.densePositionOffsets;
  if (!dense) {
    return undefined;
  }
  if (dense.length !== vertexCount * 3) {
    throw new RangeError(
      `MMD_POSITION_MORPH_CSR_DENSE_LENGTH_INVALID:${morphIndex}:${dense.length}:${vertexCount * 3}`
    );
  }
  for (let index = 0; index < dense.length; index += 1) {
    if (!Number.isFinite(dense[index])) {
      throw new RangeError(`MMD_POSITION_MORPH_CSR_DENSE_VALUE_INVALID:${morphIndex}:${index}`);
    }
  }
  return dense;
}

function normalizeSparsePositionOffsets(
  morph: ThreeMmdGeometryMorph,
  vertexCount: number,
  morphIndex: number
): Map<number, readonly [number, number, number]> {
  const byVertex = new Map<number, readonly [number, number, number]>();
  for (let offsetIndex = 0; offsetIndex < (morph.vertexOffsets?.length ?? 0); offsetIndex += 1) {
    const offset = morph.vertexOffsets?.[offsetIndex];
    if (!offset) {
      continue;
    }
    if (!Number.isSafeInteger(offset.vertexIndex) || offset.vertexIndex < 0 || offset.vertexIndex >= vertexCount) {
      throw new RangeError(
        `MMD_POSITION_MORPH_CSR_VERTEX_INDEX_INVALID:${morphIndex}:${offsetIndex}:${offset.vertexIndex}`
      );
    }
    if (!offset.position.every(Number.isFinite)) {
      throw new RangeError(`MMD_POSITION_MORPH_CSR_VALUE_INVALID:${morphIndex}:${offsetIndex}`);
    }
    byVertex.set(offset.vertexIndex, offset.position);
  }
  return byVertex;
}

function countDenseEntries(dense: Float32Array, entriesPerVertex: Uint32Array): void {
  for (let vertexIndex = 0; vertexIndex < entriesPerVertex.length; vertexIndex += 1) {
    const base = vertexIndex * 3;
    if ((dense[base] ?? 0) !== 0 || (dense[base + 1] ?? 0) !== 0 || (dense[base + 2] ?? 0) !== 0) {
      entriesPerVertex[vertexIndex] = (entriesPerVertex[vertexIndex] ?? 0) + 1;
    }
  }
}

function writeDenseEntries(
  dense: Float32Array,
  morphIndex: number,
  cursors: Uint32Array,
  morphIndices: Uint32Array,
  values: Float32Array
): void {
  for (let vertexIndex = 0; vertexIndex < cursors.length; vertexIndex += 1) {
    const base = vertexIndex * 3;
    const x = dense[base] ?? 0;
    const y = dense[base + 1] ?? 0;
    const z = dense[base + 2] ?? 0;
    if (x !== 0 || y !== 0 || z !== 0) {
      writeEntry(vertexIndex, morphIndex, x, y, z, cursors, morphIndices, values);
    }
  }
}

function writeEntry(
  vertexIndex: number,
  morphIndex: number,
  x: number,
  y: number,
  z: number,
  cursors: Uint32Array,
  morphIndices: Uint32Array,
  values: Float32Array
): void {
  const entryIndex = cursors[vertexIndex] ?? 0;
  cursors[vertexIndex] = entryIndex + 1;
  morphIndices[entryIndex] = morphIndex;
  const valueBase = entryIndex * 3;
  values[valueBase] = x;
  values[valueBase + 1] = y;
  values[valueBase + 2] = z;
}

function hasNonZeroComponent(position: readonly [number, number, number]): boolean {
  return position[0] !== 0 || position[1] !== 0 || position[2] !== 0;
}

export function packMmdUvMorphsToVertexCsr(
  vertexCount: number,
  morphs: readonly ThreeMmdGeometryMorph[],
  additionalUvIndex?: number
): MmdUvMorphCsr {
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 0) {
    throw new RangeError(`MMD_UV_MORPH_CSR_VERTEX_COUNT_INVALID:${vertexCount}`);
  }
  const componentCount = additionalUvIndex === undefined ? 2 : 4;
  const entriesPerVertex = new Uint32Array(vertexCount);
  const valuesByMorph = new Array<Map<number, readonly number[]> | undefined>(morphs.length);

  for (let morphIndex = 0; morphIndex < morphs.length; morphIndex += 1) {
    const morph = morphs[morphIndex];
    if (!morph) continue;
    const values = resolveUvOffsets(morph, vertexCount, morphIndex, additionalUvIndex);
    if (values.size === 0) continue;
    valuesByMorph[morphIndex] = values;
    for (const [vertexIndex, value] of values) {
      if (hasNonZeroValues(value)) {
        entriesPerVertex[vertexIndex] = (entriesPerVertex[vertexIndex] ?? 0) + 1;
      }
    }
  }

  const rowOffsets = new Uint32Array(vertexCount + 1);
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    rowOffsets[vertexIndex + 1] = (rowOffsets[vertexIndex] ?? 0) + (entriesPerVertex[vertexIndex] ?? 0);
  }
  const entryCount = rowOffsets[vertexCount] ?? 0;
  const morphIndices = new Uint32Array(entryCount);
  const values = new Float32Array(entryCount * componentCount);
  const cursors = rowOffsets.slice(0, vertexCount);
  for (let morphIndex = 0; morphIndex < valuesByMorph.length; morphIndex += 1) {
    for (const [vertexIndex, value] of valuesByMorph[morphIndex] ?? []) {
      if (!hasNonZeroValues(value)) continue;
      const entryIndex = cursors[vertexIndex] ?? 0;
      cursors[vertexIndex] = entryIndex + 1;
      morphIndices[entryIndex] = morphIndex;
      for (let component = 0; component < componentCount; component += 1) {
        values[entryIndex * componentCount + component] = value[component] ?? 0;
      }
    }
  }
  return { vertexCount, morphCount: morphs.length, componentCount, rowOffsets, morphIndices, values };
}

function resolveUvOffsets(
  morph: ThreeMmdGeometryMorph,
  vertexCount: number,
  morphIndex: number,
  additionalUvIndex: number | undefined
): Map<number, readonly number[]> {
  const componentCount = additionalUvIndex === undefined ? 2 : 4;
  const provider = (morph as DenseProviderMorph)[denseMorphProviderSymbol];
  const dense = additionalUvIndex === undefined
    ? provider?.createUvOffsets(vertexCount) ?? morph.denseUvOffsets
    : provider?.createAdditionalUvOffsets(additionalUvIndex, vertexCount) ??
      morph.denseAdditionalUvOffsets?.[additionalUvIndex];
  const byVertex = new Map<number, readonly number[]>();
  if (dense) {
    if (dense.length !== vertexCount * componentCount) {
      throw new RangeError(`MMD_UV_MORPH_CSR_DENSE_LENGTH_INVALID:${morphIndex}:${dense.length}`);
    }
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const base = vertexIndex * componentCount;
      const x = dense[base] ?? 0;
      const y = dense[base + 1] ?? 0;
      const z = componentCount === 4 ? (dense[base + 2] ?? 0) : 0;
      const w = componentCount === 4 ? (dense[base + 3] ?? 0) : 0;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(w)) {
        throw new RangeError(`MMD_UV_MORPH_CSR_DENSE_VALUE_INVALID:${morphIndex}:${vertexIndex}`);
      }
      if (x !== 0 || y !== 0 || z !== 0 || w !== 0) {
        byVertex.set(vertexIndex, componentCount === 2 ? [x, y] : [x, y, z, w]);
      }
    }
    return byVertex;
  }
  const offsets = additionalUvIndex === undefined ? morph.uvOffsets : morph.additionalUvOffsets;
  for (let offsetIndex = 0; offsetIndex < (offsets?.length ?? 0); offsetIndex += 1) {
    const offset = offsets?.[offsetIndex];
    if (!offset || ("uvIndex" in offset && offset.uvIndex !== additionalUvIndex)) continue;
    if (!Number.isSafeInteger(offset.vertexIndex) || offset.vertexIndex < 0 || offset.vertexIndex >= vertexCount) {
      throw new RangeError(`MMD_UV_MORPH_CSR_VERTEX_INDEX_INVALID:${morphIndex}:${offsetIndex}`);
    }
    const value = Array.from(offset.uv, (component) => component ?? 0).slice(0, componentCount);
    if (value.length !== componentCount || !value.every(Number.isFinite)) {
      throw new RangeError(`MMD_UV_MORPH_CSR_VALUE_INVALID:${morphIndex}:${offsetIndex}`);
    }
    byVertex.set(offset.vertexIndex, value);
  }
  return byVertex;
}

function hasNonZeroValues(values: readonly number[]): boolean {
  return values.some((value) => value !== 0);
}
