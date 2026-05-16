import { detectModelFormat } from "../parser/index.js";
import { parsePmd } from "../parser/model/PmdModelParser.js";
import { parsePmx } from "../parser/model/PmxModelParser.js";
import type { ParsedPmd } from "../parser/model/PmdModelParser.js";
import type { ParsedPmx } from "../parser/model/PmxModelParser.js";
import { createLoaderMmdModelData } from "./internalModelData.js";
import type { LoaderMmdModelData } from "./internalModelData.js";

export type ParsedMmdModel = ParsedPmx | ParsedPmd;

export function parseLoaderMmdModelData(bytes: Uint8Array): LoaderMmdModelData {
  const format = detectModelFormat(bytes);
  const parsed = format === "pmx" ? parsePmx(bytes) : parsePmd(bytes);
  return createLoaderMmdModelData({
    coordinateSystem: "mmd-right-handed-y-up",
    metadata: {
      format: parsed.metadata.format,
      version: parsed.metadata.version,
      encoding: parsed.metadata.encoding,
      name: parsed.metadata.name,
      englishName: parsed.metadata.englishName,
      comment: parsed.metadata.comment,
      englishComment: parsed.metadata.englishComment,
      diagnostics: parsed.metadata.diagnostics
    },
    geometry: parsed.geometry,
    materials: parsed.materials,
    morphs: parsed.morphs,
    skeleton: parsed.skeleton,
    displayFrames: parsed.displayFrames,
    rigidBodies: parsed.rigidBodies,
    joints: parsed.joints,
    softBodies: parsed.softBodies
  });
}
