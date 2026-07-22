import { detectModelFormat } from "../formatDetection.js";
import { parsePmd } from "./PmdModelParser.js";
import { parsePmx } from "./PmxModelParser.js";
import type { BoneData } from "./modelTypes.js";

/** Parses only the skeleton data needed for model-role classification. */
export function parseMmdModelBones(input: ArrayBuffer | Uint8Array): BoneData[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return detectModelFormat(bytes) === "pmx"
    ? parsePmx(bytes, { skipGeometry: true }).skeleton.bones
    : parsePmd(bytes, { skipGeometry: true }).skeleton.bones;
}
