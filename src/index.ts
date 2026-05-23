export * from "./parser/index.js";
export * from "./runtime/index.js";
export * from "./three/index.js";
export * from "./physics/index.js";

// Wasm-backed core
export { FallbackCore } from "./parser/wasm/FallbackCore.js";
export { initCore, initCoreWithFallback } from "./parser/wasm/index.js";
export type { InitCoreOptions, MmdCore, MmdModel } from "./parser/model/modelTypes.js";
