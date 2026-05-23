import { parsePmd } from "../model/PmdModelParser.js";
import { parsePmx } from "../model/PmxModelParser.js";
import type { MmdModel, ModelMetadata } from "../model/modelTypes.js";
import { mergeWasmMetadata } from "./modelMetadata.js";
import { ParsedModel } from "./ParsedModel.js";

export function createParsedModelFromBytes(
  bytes: Uint8Array,
  format: "pmx" | "pmd",
  wasmMetadata: ModelMetadata
): MmdModel {
  const parsed = format === "pmx" ? parsePmx(bytes) : parsePmd(bytes);
  parsed.metadata = mergeWasmMetadata(parsed.metadata, wasmMetadata);
  return new ParsedModel(parsed);
}
