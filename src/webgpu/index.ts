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

export {
  computeMmdTslSparsePositionMorphs,
  disposeMmdTslSparsePositionMorphs,
  enableMmdTslSparsePositionMorphs
} from "./sparse-morph-runtime.js";

export { createMmdTslPipeline, createModelLoadOptions } from "./pipeline.js";
export type {
  MmdTslModelLoadOptions,
  MmdTslPipeline,
  MmdTslPipelineAttachOptions,
  MmdTslPipelineModel,
  MmdTslPipelineOptions,
  MmdTslSelfShadowDebugState
} from "./pipeline.js";
