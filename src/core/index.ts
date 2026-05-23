import createWasmModule from "../parser/wasm/generated/yw_mmd_core.js";
import type { InitCoreOptions, MmdCore } from "../parser/model/modelTypes.js";
import { FallbackCore } from "./wasm/FallbackCore.js";
import { WasmBackedCore } from "./wasm/WasmBackedCore.js";

export {
  createPmmScenePlan,
  createPmmStaticPreviewPlan,
  parsePmmManifest,
  resolvePmmAssetPath,
  resolvePmmAssetReference
} from "../parser/pmm/index.js";
export type {
  PmmAssetReference,
  PmmAssetResolution,
  PmmAssetResolutionOptions,
  PmmManifest,
  PmmScenePlan,
  PmmStaticPreviewPlan
} from "../parser/pmm/index.js";

export type { InitCoreOptions, MmdCore, MmdModel } from "../parser/model/modelTypes.js";

export { FallbackCore } from "./wasm/FallbackCore.js";

export async function initCore(options: InitCoreOptions = {}): Promise<MmdCore> {
  const wasm = await createWasmModule({
    locateFile: (path) => {
      if (options.wasmUrl && path.endsWith(".wasm")) {
        return String(options.wasmUrl);
      }
      return new URL(`../parser/wasm/generated/${path}`, import.meta.url).toString();
    }
  });
  if (wasm._yw_mmd_health_check() !== 1) {
    throw new Error("yw-mmd Wasm health check failed");
  }
  return new WasmBackedCore(wasm);
}

export async function initCoreWithFallback(options: InitCoreOptions = {}): Promise<MmdCore> {
  try {
    return await initCore(options);
  } catch {
    return new FallbackCore();
  }
}
