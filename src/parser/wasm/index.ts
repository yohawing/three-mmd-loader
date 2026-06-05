import type { InitCoreOptions, MmdCore } from "../model/modelTypes.js";
import { FallbackCore } from "./FallbackCore.js";

export type { InitCoreOptions, MmdCore, MmdModel } from "../model/modelTypes.js";
export { FallbackCore } from "./FallbackCore.js";

export async function initCore(_options: InitCoreOptions = {}): Promise<MmdCore> {
  return new FallbackCore();
}

export async function initCoreWithFallback(_options: InitCoreOptions = {}): Promise<MmdCore> {
  return new FallbackCore();
}
