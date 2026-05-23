export * from "./parser/index.js";
export * from "./runtime/index.js";
export * from "./three/index.js";
export * from "./physics/index.js";

// Wasm-backed core
export { FallbackCore } from "./core/wasm/FallbackCore.js";
export { initCore, initCoreWithFallback } from "./core/index.js";
export type { InitCoreOptions, MmdCore, MmdModel } from "./parser/model/modelTypes.js";
