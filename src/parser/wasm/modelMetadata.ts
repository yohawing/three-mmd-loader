import type { ModelMetadata } from "../model/modelTypes.js";

export function mergeWasmMetadata(parsed: ModelMetadata, wasm: ModelMetadata): ModelMetadata {
  return {
    ...parsed,
    version: wasm.version,
    encoding: wasm.encoding,
    counts: { ...wasm.counts, softBodies: parsed.counts.softBodies },
    indexSizes: wasm.indexSizes,
    additionalUvCount: wasm.additionalUvCount,
    diagnostics: parsed.diagnostics
  };
}
