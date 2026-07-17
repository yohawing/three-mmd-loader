export {
  MMD_TSL_DEFAULT_LIGHT_COLOR,
  MMD_TSL_DEFAULT_TOON_COORD_OFFSET,
  createMmdTslBaseColorNode,
  createMmdTslReceivedShadowNode,
  createMmdTslToonMaterial,
  syncMmdTslMaterialState
} from "./material-core.js";

export {
  appendMmdTslOutlineGroups,
  createMmdTslMaterialFromSource,
  replaceMmdModelMaterialsWithTsl
} from "./material-assembly.js";

export {
  computeMmdTslSparsePositionMorphs,
  disposeMmdTslSparsePositionMorphs,
  enableMmdTslSparsePositionMorphs
} from "./sparse-morph-runtime.js";
