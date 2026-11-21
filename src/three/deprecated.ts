import {
  syncThreeMmdRuntimeToMesh as syncThreeMmdRuntimeToMeshInternal,
  syncThreeMmdRuntimeToModel as syncThreeMmdRuntimeToModelInternal,
  type MmdRuntimeMeshSyncSource as MmdRuntimeMeshSyncSourceInternal,
  type ThreeMmdRuntimeSyncTarget as ThreeMmdRuntimeSyncTargetInternal
} from "./runtime-sync.js";
import type { ReadModelSourceOptions as ReadModelSourceOptionsInternal } from "./modelSource.js";
import type { ReadModelSourceResult as ReadModelSourceResultInternal } from "./modelSource.js";
import type { ThreeMmdSphereMappedToonMaterial as ThreeMmdSphereMappedToonMaterialInternal } from "./materials.js";
import type { MmdToonTextureMaterial as MmdToonTextureMaterialInternal } from "./textures.js";
import {
  attachMmdMaterialMetadata as attachMmdMaterialMetadataInternal,
  computeMmdMaterialRenderOrder as computeMmdMaterialRenderOrderInternal,
  materialTransparencyMode as materialTransparencyModeInternal,
  mmdMaterialAlphaTest as mmdMaterialAlphaTestInternal,
  mmdMaterialCastsShadow as mmdMaterialCastsShadowInternal,
  mmdMaterialDepthWrite as mmdMaterialDepthWriteInternal,
  mmdMaterialMorphCanAffectAlpha as mmdMaterialMorphCanAffectAlphaInternal,
  mmdMaterialSuppressesColorAtAlpha as mmdMaterialSuppressesColorAtAlphaInternal,
  mmdMaterialTransparencyMode as mmdMaterialTransparencyModeInternal,
  type MmdMaterialRenderOrderEntry as MmdMaterialRenderOrderEntryInternal
} from "./material/material-metadata.js";
import {
  attachMmdMaterialFactors as attachMmdMaterialFactorsInternal,
  attachMmdSphereTexture as attachMmdSphereTextureInternal,
  materialHasTextureMap as materialHasTextureMapInternal,
  mmdSphereModeToUniform as mmdSphereModeToUniformInternal
} from "./material/material-shader-hooks.js";
import {
  attachMmdOutlineExpansion as attachMmdOutlineExpansionInternal,
  createMmdMaterialRenderOrderMeshes as createMmdMaterialRenderOrderMeshesInternal,
  createMmdOutlineMeshes as createMmdOutlineMeshesInternal,
  syncMmdOutlineMaterialStates as syncMmdOutlineMaterialStatesInternal,
  type MmdMaterialRenderOrderMeshOptions as MmdMaterialRenderOrderMeshOptionsInternal,
  type MmdOutlineModelSource as MmdOutlineModelSourceInternal,
  type MmdOutlineOptions as MmdOutlineOptionsInternal
} from "./outline.js";
import {
  attachMmdSdefSkinning as attachMmdSdefSkinningInternal,
  computeMmdSdefSkinnedNormal as computeMmdSdefSkinnedNormalInternal,
  computeMmdSdefSkinnedPosition as computeMmdSdefSkinnedPositionInternal,
  type MmdSdefNormalSkinningInput as MmdSdefNormalSkinningInputInternal,
  type MmdSdefSkinningInput as MmdSdefSkinningInputInternal
} from "./material/material-sdef.js";
import {
  computeQdefSkinnedNormal as computeQdefSkinnedNormalInternal,
  computeQdefSkinnedPosition as computeQdefSkinnedPositionInternal,
  type MmdQdefNormalSkinningInput as MmdQdefNormalSkinningInputInternal,
  type MmdQdefSkinningInput as MmdQdefSkinningInputInternal
} from "./material/material-qdef.js";
import {
  defaultSharedToonTexturePath as defaultSharedToonTexturePathInternal,
  getDefaultToonGradientMap as getDefaultToonGradientMapInternal,
  isMmdDdsTexturePath as isMmdDdsTexturePathInternal,
  normalizeMmdTexturePath as normalizeMmdTexturePathInternal,
  resolveMmdToonTextureReference as resolveMmdToonTextureReferenceInternal,
  type MmdToonTextureReference as MmdToonTextureReferenceInternal
} from "./textures.js";

// Deprecated in 0.9.0, removed in 1.0.0
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. ThreeMmdLoader and createThreeMmdMaterials apply these hooks automatically. */
export const attachMmdMaterialMetadata = attachMmdMaterialMetadataInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. No replacement. */
export const computeMmdMaterialRenderOrder = computeMmdMaterialRenderOrderInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Read model.diagnostics.materials[i].finalTransparencyMode. */
export const materialTransparencyMode = materialTransparencyModeInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. No replacement. */
export const mmdMaterialAlphaTest = mmdMaterialAlphaTestInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. No replacement. */
export const mmdMaterialCastsShadow = mmdMaterialCastsShadowInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. No replacement. */
export const mmdMaterialDepthWrite = mmdMaterialDepthWriteInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Read model.diagnostics.materials[i].morphAlphaTransparent. */
export const mmdMaterialMorphCanAffectAlpha = mmdMaterialMorphCanAffectAlphaInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. No replacement. */
export const mmdMaterialSuppressesColorAtAlpha = mmdMaterialSuppressesColorAtAlphaInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Read model.diagnostics.materials[i].finalTransparencyMode. */
export const mmdMaterialTransparencyMode = mmdMaterialTransparencyModeInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. ThreeMmdLoader and createThreeMmdMaterials apply these hooks automatically. */
export const attachMmdMaterialFactors = attachMmdMaterialFactorsInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. ThreeMmdLoader and createThreeMmdMaterials apply these hooks automatically. */
export const attachMmdSphereTexture = attachMmdSphereTextureInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. No replacement. */
export const materialHasTextureMap = materialHasTextureMapInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. No replacement. */
export const mmdSphereModeToUniform = mmdSphereModeToUniformInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. ThreeMmdLoader and createThreeMmdMaterials apply these hooks automatically. */
export const attachMmdOutlineExpansion = attachMmdOutlineExpansionInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use the outline and materialRenderOrder load options instead of outlines and renderOrderProxies. */
export const createMmdMaterialRenderOrderMeshes = createMmdMaterialRenderOrderMeshesInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use the outline and materialRenderOrder load options instead of outlines and renderOrderProxies. */
export const createMmdOutlineMeshes = createMmdOutlineMeshesInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use the outline and materialRenderOrder load options instead of outlines and renderOrderProxies. */
export const syncMmdOutlineMaterialStates = syncMmdOutlineMaterialStatesInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. ThreeMmdLoader and createThreeMmdMaterials apply these hooks automatically. */
export const attachMmdSdefSkinning = attachMmdSdefSkinningInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. CPU reference implementation for tests. No replacement. */
export const computeMmdSdefSkinnedNormal = computeMmdSdefSkinnedNormalInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. CPU reference implementation for tests. No replacement. */
export const computeMmdSdefSkinnedPosition = computeMmdSdefSkinnedPositionInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. CPU reference implementation for tests. No replacement. */
export const computeQdefSkinnedNormal = computeQdefSkinnedNormalInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. CPU reference implementation for tests. No replacement. */
export const computeQdefSkinnedPosition = computeQdefSkinnedPositionInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. CPU reference implementation for tests. No replacement. */
export type MmdQdefNormalSkinningInput = MmdQdefNormalSkinningInputInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. CPU reference implementation for tests. No replacement. */
export type MmdQdefSkinningInput = MmdQdefSkinningInputInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use createTextureResolver, resolveMappedTexture, or createMmdBuiltInToonTextureMap. */
export const defaultSharedToonTexturePath = defaultSharedToonTexturePathInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use createTextureResolver, resolveMappedTexture, or createMmdBuiltInToonTextureMap. */
export const getDefaultToonGradientMap = getDefaultToonGradientMapInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use createTextureResolver, resolveMappedTexture, or createMmdBuiltInToonTextureMap. */
export const isMmdDdsTexturePath = isMmdDdsTexturePathInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use createTextureResolver, resolveMappedTexture, or createMmdBuiltInToonTextureMap. */
export const normalizeMmdTexturePath = normalizeMmdTexturePathInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use createTextureResolver, resolveMappedTexture, or createMmdBuiltInToonTextureMap. */
export const resolveMmdToonTextureReference = resolveMmdToonTextureReferenceInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. CPU reference implementation for tests. No replacement. */
export type MmdSdefNormalSkinningInput = MmdSdefNormalSkinningInputInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. CPU reference implementation for tests. No replacement. */
export type MmdSdefSkinningInput = MmdSdefSkinningInputInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use the outline and materialRenderOrder load options instead of outlines and renderOrderProxies. */
export type MmdMaterialRenderOrderMeshOptions = MmdMaterialRenderOrderMeshOptionsInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use the outline and materialRenderOrder load options instead of outlines and renderOrderProxies. */
export type MmdOutlineModelSource = MmdOutlineModelSourceInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use the outline and materialRenderOrder load options instead of outlines and renderOrderProxies. */
export type MmdOutlineOptions = MmdOutlineOptionsInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. No replacement. */
export type MmdMaterialRenderOrderEntry = MmdMaterialRenderOrderEntryInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use createTextureResolver, resolveMappedTexture, or createMmdBuiltInToonTextureMap. */
export type MmdToonTextureReference = MmdToonTextureReferenceInternal;

/** @deprecated No replacement. Will be removed in 1.0.0. */
export type ReadModelSourceOptions = ReadModelSourceOptionsInternal;
/** @deprecated No replacement. Will be removed in 1.0.0. */
export type ReadModelSourceResult = ReadModelSourceResultInternal;
/** @deprecated No replacement. Will be removed in 1.0.0. */
export type ThreeMmdSphereMappedToonMaterial = ThreeMmdSphereMappedToonMaterialInternal;
/** @deprecated No replacement. Will be removed in 1.0.0. */
export type MmdToonTextureMaterial = MmdToonTextureMaterialInternal;

/** @deprecated No replacement. ThreeMmdModel.update and runtime.tick already synchronize the mesh. */
export const syncThreeMmdRuntimeToMesh = syncThreeMmdRuntimeToMeshInternal;

/** @deprecated No replacement. ThreeMmdModel.update and runtime.tick already synchronize the mesh. */
export const syncThreeMmdRuntimeToModel = syncThreeMmdRuntimeToModelInternal;

/** @deprecated No replacement. ThreeMmdModel.update and runtime.tick already synchronize the mesh. */
export type MmdRuntimeMeshSyncSource = MmdRuntimeMeshSyncSourceInternal;

/** @deprecated No replacement. ThreeMmdModel.update and runtime.tick already synchronize the mesh. */
export type ThreeMmdRuntimeSyncTarget = ThreeMmdRuntimeSyncTargetInternal;
