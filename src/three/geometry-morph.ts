import * as THREE from "three";

import { denseMorphProviderSymbol, type DenseMorphProvider } from "../parser/model/denseMorphProvider.js";

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

export function createMorphAttributes(
  morphs: readonly ThreeMmdGeometryMorph[],
  length: number,
  itemSize: number,
  createOffsets: (morph: ThreeMmdGeometryMorph, length: number) => Float32Array | undefined
): THREE.BufferAttribute[] {
  const zeroAttribute = new THREE.Float32BufferAttribute(new Float32Array(length), itemSize);
  return morphs.map((morph) => {
    const offsets = createOffsets(morph, length);
    return offsets ? new THREE.Float32BufferAttribute(offsets, itemSize) : zeroAttribute;
  });
}

export function hasUvMorphOffsets(morph: ThreeMmdGeometryMorph): boolean {
  return !!morph.uvOffsets?.length || !!morph.denseUvOffsets;
}

export function hasPositionMorphOffsets(morph: ThreeMmdGeometryMorph): boolean {
  return (
    (getDenseMorphProvider(morph)?.sparsePositionOffsets?.count ?? 0) > 0 ||
    !!morph.vertexOffsets?.length ||
    !!morph.densePositionOffsets
  );
}

export function hasAdditionalUvMorphOffsets(morph: ThreeMmdGeometryMorph, uvIndex: number): boolean {
  return (
    !!morph.denseAdditionalUvOffsets?.[uvIndex] ||
    !!morph.additionalUvOffsets?.some((offset) => offset.uvIndex === uvIndex)
  );
}

export function hasGeometryMorphOffsets(morph: ThreeMmdGeometryMorph): boolean {
  return (
    (getDenseMorphProvider(morph)?.sparsePositionOffsets?.count ?? 0) > 0 ||
    !!morph.vertexOffsets?.length ||
    !!morph.densePositionOffsets ||
    !!morph.uvOffsets?.length ||
    !!morph.denseUvOffsets ||
    !!morph.additionalUvOffsets?.length ||
    !!morph.denseAdditionalUvOffsets?.some((offsets) => !!offsets)
  );
}

export function createThreeMorphPositionOffsets(
  positionLength: number,
  morph: ThreeMmdGeometryMorph
): Float32Array | undefined {
  const providerOffsets = getDenseMorphProvider(morph)?.createPositionOffsets(positionLength / 3);
  if (providerOffsets) {
    return providerOffsets;
  }
  if (morph.densePositionOffsets) {
    return morph.densePositionOffsets.slice();
  }
  if (!morph.vertexOffsets?.length) {
    return undefined;
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

export function createThreeMorphUvOffsets(
  uvLength: number,
  morph: ThreeMmdGeometryMorph
): Float32Array | undefined {
  const providerOffsets = getDenseMorphProvider(morph)?.createUvOffsets(uvLength / 2);
  if (providerOffsets) {
    return providerOffsets;
  }
  if (morph.denseUvOffsets) {
    return morph.denseUvOffsets.slice();
  }
  if (!morph.uvOffsets?.length) {
    return undefined;
  }
  const offsets = new Float32Array(uvLength);
  for (const offset of morph.uvOffsets ?? []) {
    const base = offset.vertexIndex * 2;
    offsets[base] = offset.uv[0];
    offsets[base + 1] = offset.uv[1];
  }
  return offsets;
}

export function createThreeAdditionalMorphUvOffsets(
  uvLength: number,
  uvIndex: number,
  morph: ThreeMmdGeometryMorph
): Float32Array | undefined {
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
  if (!morph.additionalUvOffsets?.some((offset) => offset.uvIndex === uvIndex)) {
    return undefined;
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

export function getDenseMorphProvider(morph: ThreeMmdGeometryMorph): DenseMorphProvider | undefined {
  return (morph as DenseProviderMorph)[denseMorphProviderSymbol];
}
