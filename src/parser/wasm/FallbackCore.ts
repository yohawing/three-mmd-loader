import { toUint8Array } from "../binary/index.js";
import type { MmdAnimation, MmdCore, MmdModel, MmdPose } from "../model/modelTypes.js";
import { parsePmd } from "../model/PmdModelParser.js";
import { parsePmx } from "../model/PmxModelParser.js";
import { parseVmd } from "../vmd/index.js";
import { parseVpd, vpdPoseToAnimation } from "../vpd/index.js";
import { detectModelFormat } from "../formatDetection.js";
import { createParsedModelFromBytes } from "./createParsedModel.js";

export class FallbackCore implements MmdCore {
  version(): string {
    return "0.0.0+ts-fallback";
  }

  healthCheck(): boolean {
    return true;
  }

  loadModel(
    bytes: ArrayBuffer | Uint8Array,
    options: { format?: "pmx" | "pmd" | "auto" } = {}
  ): MmdModel {
    const input = toUint8Array(bytes);
    const format =
      options.format === "auto" || !options.format ? detectModelFormat(input) : options.format;
    const metadata = format === "pmx" ? parsePmx(input).metadata : parsePmd(input).metadata;
    return createParsedModelFromBytes(input, format, metadata);
  }

  loadVmd(bytes: ArrayBuffer | Uint8Array): MmdAnimation {
    const input = toUint8Array(bytes);
    return { ...parseVmd(input), bytes: input.slice() };
  }

  loadVpd(bytes: ArrayBuffer | Uint8Array): MmdPose {
    const input = toUint8Array(bytes);
    return { ...parseVpd(input), bytes: input.slice() };
  }

  loadVpdAnimation(bytes: ArrayBuffer | Uint8Array, name?: string): MmdAnimation {
    return vpdPoseToAnimation(this.loadVpd(bytes), name);
  }
}
