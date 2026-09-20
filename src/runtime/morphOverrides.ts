import type { MmdMorphOverrides } from "./types.js";

export function validateMorphOverrides(overrides: MmdMorphOverrides | undefined, morphCount: number): void {
  if (!overrides) return;
  if (overrides.indices.length !== overrides.weights.length) {
    throw new RangeError("Morph override indices and weights must have equal lengths");
  }
  for (let i = 0; i < overrides.indices.length; i += 1) {
    const index = overrides.indices[i] ?? -1;
    if (!Number.isInteger(index) || index < 0 || index >= morphCount || !Number.isFinite(overrides.weights[i])) {
      throw new RangeError("Morph overrides require valid PMX indices and finite weights");
    }
  }
}

export function applyMorphOverrides(weights: number[] | Float32Array, overrides: MmdMorphOverrides | undefined): void {
  if (!overrides) return;
  for (let i = 0; i < overrides.indices.length; i += 1) {
    const index = overrides.indices[i];
    const weight = overrides.weights[i];
    if (index !== undefined && weight !== undefined) weights[index] = weight;
  }
}
