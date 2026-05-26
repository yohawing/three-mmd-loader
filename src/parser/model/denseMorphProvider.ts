export interface DenseMorphProvider {
  createPositionOffsets(vertexCount: number): Float32Array | undefined;
  createUvOffsets(vertexCount: number): Float32Array | undefined;
  createAdditionalUvOffsets(uvIndex: number, vertexCount: number): Float32Array | undefined;
}

export const denseMorphProviderSymbol: unique symbol = Symbol("three-mmd-loader.denseMorphProvider");
