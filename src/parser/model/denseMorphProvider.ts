export interface SparsePositionMorphOffsets {
  readonly vertexIndices: Uint32Array;
  readonly positions: Float32Array;
  readonly start: number;
  readonly count: number;
}

export interface DenseMorphProvider {
  readonly sparsePositionOffsets?: SparsePositionMorphOffsets;
  createPositionOffsets(vertexCount: number): Float32Array | undefined;
  createUvOffsets(vertexCount: number): Float32Array | undefined;
  createAdditionalUvOffsets(uvIndex: number, vertexCount: number): Float32Array | undefined;
}

export const denseMorphProviderSymbol: unique symbol = Symbol("three-mmd-loader.denseMorphProvider");
