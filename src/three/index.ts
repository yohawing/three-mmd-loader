export { createThreeBufferGeometry } from "./geometry.js";
export { createThreeMorphSplitGeometries } from "./geometry-split.js";
export type { ThreeMmdGeometryOptions } from "./geometry.js";
export { applyMmdCameraStateToThreeCamera } from "./camera.js";
export { applyMmdLightStateToThreeDirectionalLight } from "./light.js";
export { disposeMmdModel } from "./dispose.js";
export type { DisposeMmdModelOptions } from "./dispose.js";
export { classifyMmdAssetKind, createMmdFileIndex } from "./assets.js";
export type { MmdAssetKind, MmdFileIndex } from "./assets.js";
export {
  createMmdTextureMapFromFiles,
  findMmdAccessoryFiles,
  findMmdAudioFiles,
  findMmdModelFiles,
  findMmdMotionFiles,
  isMmdAccessoryFile,
  isMmdAudioFile,
  isMmdModelFile,
  isMmdMotionFile,
  isMmdTextureFile,
  normalizeMmdRelativePath
} from "./folder.js";
export { isModelSource } from "./modelSource.js";
export type {
  MmdDefaultMaterialTransparencyDiagnostic,
  MmdMaterialTransparencyReason
} from "./material/material-texture-set.js";
export { applyThreeMmdMaterialTextures, createThreeMmdMaterials } from "./materials.js";
export { mmdWorldMatrixToThree } from "./runtime-sync.js";
export {
  applyMmdSelfShadowStateToThreeDirectionalLight,
  configureMmdSelfShadowDirectionalLight,
  fitMmdSelfShadowDirectionalLightToBox,
  MMD_SELF_SHADOW_LAYER
} from "./shadow.js";
export { createThreeSkeleton } from "./skeleton.js";
export { syncMmdModelShadowFlags } from "./material/material-metadata.js";
export { syncMmdMaterialStates, syncMmdSpecularDirection } from "./material/material-sync.js";
export {
  createMmdBuiltInToonTextureMap,
  createTextureResolver,
  resolveMappedTexture
} from "./textures.js";
export type {
  ApplyMmdCameraStateOptions
} from "./camera.js";
export type {
  ApplyMmdLightStateOptions
} from "./light.js";
export type {
  ApplyMmdSelfShadowStateOptions,
  ConfigureMmdSelfShadowDirectionalLightOptions,
  FitMmdSelfShadowDirectionalLightOptions
} from "./shadow.js";
export type {
  ThreeMmdGeometryBuffers,
  ThreeMmdGeometryMaterial,
  ThreeMmdMaterialGroup,
  ThreeMmdQdefBuffers,
  ThreeMmdSdefBuffers
} from "./geometry.js";
export type {
  ThreeMmdAdditionalUvMorphOffset,
  ThreeMmdGeometryMorph,
  ThreeMmdUvMorphOffset,
  ThreeMmdVertexMorphOffset
} from "./geometry-morph.js";
export type { ThreeMmdMorphSplitGeometry } from "./geometry-split.js";
export type {
  ModelSource,
  ModelSourceDiagnostic,
  ModelSourceFetch
} from "./modelSource.js";
export type {
  MaterialTransparencyDiagnostic,
  TextureLoadDiagnostic,
  ThreeMmdMaterialTextureOptions,
  ThreeMmdTextureLoader
} from "./materials.js";
export type {
  LoaderPerformanceMeasure,
  LoaderPerformanceOptions
} from "./performance.js";
export type {
  MmdRuntimeMeshSyncSource,
  ThreeMmdRuntimeSyncTarget,
  ReadModelSourceOptions,
  ReadModelSourceResult,
  ThreeMmdSphereMappedToonMaterial,
  MmdToonTextureMaterial
} from "./deprecated.js";
export type {
  MmdWorldMatrixBuffer,
  MmdWorldMatrixColumnMajorTuple
} from "./runtime-sync.js";
export type { ThreeMmdSkeletonBone, ThreeMmdSkeletonData } from "./skeleton.js";
export type {
  MmdMaterialTransparencyMode,
  TextureMap,
  TextureResolver
} from "./textures.js";
export {
  syncThreeMmdRuntimeToMesh,
  syncThreeMmdRuntimeToModel,
  attachMmdMaterialMetadata,
  computeMmdMaterialRenderOrder,
  materialTransparencyMode,
  mmdMaterialAlphaTest,
  mmdMaterialCastsShadow,
  mmdMaterialDepthWrite,
  mmdMaterialMorphCanAffectAlpha,
  mmdMaterialSuppressesColorAtAlpha,
  mmdMaterialTransparencyMode,
  attachMmdMaterialFactors,
  attachMmdSphereTexture,
  materialHasTextureMap,
  mmdSphereModeToUniform,
  attachMmdOutlineExpansion,
  createMmdMaterialRenderOrderMeshes,
  createMmdOutlineMeshes,
  syncMmdOutlineMaterialStates,
  attachMmdSdefSkinning,
  computeMmdSdefSkinnedNormal,
  computeMmdSdefSkinnedPosition,
  computeQdefSkinnedNormal,
  computeQdefSkinnedPosition,
  defaultSharedToonTexturePath,
  getDefaultToonGradientMap,
  isMmdDdsTexturePath,
  normalizeMmdTexturePath,
  resolveMmdToonTextureReference
} from "./deprecated.js";
export type {
  MmdQdefNormalSkinningInput,
  MmdQdefSkinningInput,
  MmdSdefNormalSkinningInput,
  MmdSdefSkinningInput,
  MmdMaterialRenderOrderMeshOptions,
  MmdOutlineModelSource,
  MmdOutlineOptions,
  MmdMaterialRenderOrderEntry,
  MmdToonTextureReference
} from "./deprecated.js";
export type {
  ThreeMmdLoaderOptions,
  ThreeMmdRuntimeFactoryContext,
  ThreeMmdCoreFallbackEvent,
  ThreeMmdLoadModelOptions,
  ThreeMmdCoreDiagnostic
} from "./loader-options.js";
export type { ThreeMmdModelSourceDescriptor, ThreeMmdModel } from "./loaded-model.js";
export type { ThreeMmdAnimation, ThreeMmdPose } from "./loader-animation.js";
export { ThreeMmdLoader } from "./loader.js";
