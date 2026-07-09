import type { MmdCore } from "../model/modelTypes.js";
import type { AccessoryParsedManifest } from "./AccessoryParsedTypes.js";

export function parseAccessory(
  bytes: ArrayBuffer | Uint8Array,
  core: MmdCore,
  fileName?: string
): AccessoryParsedManifest {
  const typed = core as {
    parseAccessory?(
      bytes: ArrayBuffer | Uint8Array,
      fileName?: string
    ): AccessoryParsedManifest;
  };
  if (typeof typed.parseAccessory !== "function") {
    throw new Error("Accessory parsing requires WASM core (use initCore())");
  }
  return typed.parseAccessory(bytes, fileName);
}
