/**
 * The WebGPU TSL subpath is outside semver guarantees, including in 1.x.
 * Minor releases may introduce breaking changes.
 * @experimental
 * @module
 */
export {
  MMD_TSL_DEFAULT_LIGHT_COLOR,
  MMD_TSL_DEFAULT_TOON_COORD_OFFSET,
  createMmdTslBaseColorNode,
  createMmdTslToonMaterial,
  syncMmdTslMaterialState
} from "./material-core.js";
export type { MmdTslMaterialCoreOptions, MmdTslMaterialUniforms } from "./material-core.js";

export {
  appendMmdTslOutlineGroups,
  createMmdTslMaterialFromSource,
  replaceMmdModelMaterialsWithTsl
} from "./material-assembly.js";
export type { MmdTslMaterialAssemblyOptions } from "./material-assembly.js";

export {
  createMmdTslShadowCaster,
  disposeMmdTslShadowCaster,
  type CreateMmdTslShadowCasterOptions
} from "./shadow-caster.js";

export type { MmdWebGpuRenderer } from "./sparse-morph-runtime.js";
export {
  computeMmdTslSparsePositionMorphs,
  disposeMmdTslSparsePositionMorphs,
  enableMmdTslSparsePositionMorphs
} from "./sparse-morph-runtime.js";

export { createMmdTslModelLoadOptions, createMmdTslPipeline, createModelLoadOptions } from "./pipeline.js";
export type {
  MmdTslModelLoadOptions,
  MmdTslPipeline,
  MmdTslPipelineAttachOptions,
  MmdTslPipelineModel,
  MmdTslPipelineOptions,
  MmdTslSelfShadowDebugState
} from "./pipeline.js";
