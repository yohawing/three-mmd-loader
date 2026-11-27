import type * as NodeFs from "node:fs/promises";
import type { InitCoreOptions, MmdCore } from "../model/modelTypes.js";
import type * as MmdAnimWasmGenerated from "./generated/mmd_anim_wasm.js";
import { FallbackCore } from "./FallbackCore.js";
import { MmdAnimBackedCore } from "./MmdAnimBackedCore.js";

export type { InitCoreOptions, MmdCore, MmdModel } from "../model/modelTypes.js";
export { FallbackCore } from "./FallbackCore.js";

type MmdAnimWasmModule = typeof MmdAnimWasmGenerated;

export async function initCore(options: InitCoreOptions = {}): Promise<MmdCore> {
  let mmdAnimWasm: MmdAnimWasmModule;
  try {
    mmdAnimWasm = await import("./generated/mmd_anim_wasm.js");
  } catch (error) {
    throw new Error(
      "mmd-anim wasm module is missing. Run npm run build:mmd-anim && npm run build before initCore().",
      { cause: error }
    );
  }
  await initMmdAnimWasm(mmdAnimWasm, options);
  return new MmdAnimBackedCore({
    parsePmxModelNonGeometryJson: mmdAnimWasm.parsePmxModelNonGeometryJson,
    parseMmdFormatJson: mmdAnimWasm.parseMmdFormatJson,
    parseVmdAnimationJson: mmdAnimWasm.parseVmdAnimationJson,
    WasmPmxParsedModel: mmdAnimWasm.WasmPmxParsedModel,
    WasmPmxGeometry: mmdAnimWasm.WasmPmxGeometry,
    wasm_wrapper_version: mmdAnimWasm.wasm_wrapper_version
  });
}

async function initMmdAnimWasm(
  mmdAnimWasm: MmdAnimWasmModule,
  options: InitCoreOptions
): Promise<void> {
  if (options.wasmUrl != null) {
    await mmdAnimWasm.default(options.wasmUrl as string | URL);
    return;
  }
  if (isNodeLikeRuntime()) {
    // Keep the Node builtin out of browser bundlers' module graphs.
    const fsModule = "node:fs/promises";
    const { readFile }: typeof NodeFs =
      await import(/* @vite-ignore */ /* webpackIgnore: true */ fsModule);
    const bytes = await readFile(new URL("./generated/mmd_anim_wasm_bg.wasm", import.meta.url));
    await mmdAnimWasm.default({ module_or_path: bytes });
    return;
  }
  await mmdAnimWasm.default();
}

function isNodeLikeRuntime(): boolean {
  return typeof process !== "undefined" && process.versions?.node !== undefined;
}

export async function initCoreWithFallback(options: InitCoreOptions = {}): Promise<MmdCore> {
  try {
    return await initCore(options);
  } catch {
    return new FallbackCore();
  }
}
