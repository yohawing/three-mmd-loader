// generated — do not edit. Run node scripts/generate-root-deprecations.mjs.
import {
  type AccessoryDiagnostic as AccessoryDiagnostic_,
  type AccessoryMaterial as AccessoryMaterial_,
  type AccessoryMeshSummary as AccessoryMeshSummary_,
  type AccessoryParsedManifest as AccessoryParsedManifest_,
  type AccessoryVacSettings as AccessoryVacSettings_,
  type AccessoryVertexColor as AccessoryVertexColor_,
  createPmmScenePlan as createPmmScenePlan_,
  createPmmStaticPreviewPlan as createPmmStaticPreviewPlan_,
  detectModelFormat as detectModelFormat_,
  detectStandardBones as detectStandardBones_,
  FallbackCore as FallbackCore_,
  getStandardBoneDefinitions as getStandardBoneDefinitions_,
  initCore as initCore_,
  type InitCoreOptions as InitCoreOptions_,
  initCoreWithFallback as initCoreWithFallback_,
  type MaterialRuntimeState as MaterialRuntimeState_,
  type MmdModelFormat as MmdModelFormat_,
  parseAccessory as parseAccessory_,
  parsePmdMetadata as parsePmdMetadata_,
  parsePmdSectionInventory as parsePmdSectionInventory_,
  parsePmmDocument as parsePmmDocument_,
  parsePmmManifest as parsePmmManifest_,
  parsePmxMetadata as parsePmxMetadata_,
  parsePmxSectionInventory as parsePmxSectionInventory_,
  parseVmd as parseVmd_,
  parseVmdMetadata as parseVmdMetadata_,
  parseVmdSectionInventory as parseVmdSectionInventory_,
  parseVpd as parseVpd_,
  parseVpdMetadata as parseVpdMetadata_,
  parseVpdPose as parseVpdPose_,
  parseVpdPoseInventory as parseVpdPoseInventory_,
  type PmdHeader as PmdHeader_,
  type PmdMetadata as PmdMetadata_,
  type PmdSectionCounts as PmdSectionCounts_,
  type PmdSectionInventory as PmdSectionInventory_,
  type PmdSectionName as PmdSectionName_,
  type PmdSectionRange as PmdSectionRange_,
  type PmmAssetReference as PmmAssetReference_,
  type PmmAssetResolution as PmmAssetResolution_,
  type PmmAssetResolutionOptions as PmmAssetResolutionOptions_,
  type PmmAssetSummary as PmmAssetSummary_,
  type PmmCameraKeyframeSummary as PmmCameraKeyframeSummary_,
  type PmmDisplayState as PmmDisplayState_,
  type PmmDocumentAccessoryBlockSummary as PmmDocumentAccessoryBlockSummary_,
  type PmmDocumentAccessoryKeyframeSummary as PmmDocumentAccessoryKeyframeSummary_,
  type PmmDocumentAccessorySummary as PmmDocumentAccessorySummary_,
  type PmmDocumentBoneKeyframeSummary as PmmDocumentBoneKeyframeSummary_,
  type PmmDocumentBoneStateSummary as PmmDocumentBoneStateSummary_,
  type PmmDocumentConstraintStateSummary as PmmDocumentConstraintStateSummary_,
  type PmmDocumentCounts as PmmDocumentCounts_,
  type PmmDocumentExpandFlags as PmmDocumentExpandFlags_,
  type PmmDocumentGlobalSummary as PmmDocumentGlobalSummary_,
  type PmmDocumentKeyframeSummary as PmmDocumentKeyframeSummary_,
  type PmmDocumentModelKeyframeSummary as PmmDocumentModelKeyframeSummary_,
  type PmmDocumentModelSections as PmmDocumentModelSections_,
  type PmmDocumentModelSummary as PmmDocumentModelSummary_,
  type PmmDocumentMorphKeyframeSummary as PmmDocumentMorphKeyframeSummary_,
  type PmmDocumentMorphStateSummary as PmmDocumentMorphStateSummary_,
  type PmmDocumentOutsideParentIndexSummary as PmmDocumentOutsideParentIndexSummary_,
  type PmmDocumentOutsideParentStateSummary as PmmDocumentOutsideParentStateSummary_,
  type PmmDocumentSettingsSummary as PmmDocumentSettingsSummary_,
  type PmmDocumentSummary as PmmDocumentSummary_,
  type PmmDocumentTrackSummary as PmmDocumentTrackSummary_,
  type PmmGravityKeyframeSummary as PmmGravityKeyframeSummary_,
  type PmmHeaderTextEntry as PmmHeaderTextEntry_,
  type PmmLightKeyframeSummary as PmmLightKeyframeSummary_,
  type PmmManifest as PmmManifest_,
  type PmmModelSlot as PmmModelSlot_,
  type PmmModelSlotFlagEntry as PmmModelSlotFlagEntry_,
  type PmmParsedAssetReference as PmmParsedAssetReference_,
  type PmmParsedManifest as PmmParsedManifest_,
  type PmmParserDiagnostic as PmmParserDiagnostic_,
  type PmmProjectAssetBinding as PmmProjectAssetBinding_,
  type PmmProjectByteCoverage as PmmProjectByteCoverage_,
  type PmmProjectByteRange as PmmProjectByteRange_,
  type PmmProjectExportBlocker as PmmProjectExportBlocker_,
  type PmmProjectExportReadiness as PmmProjectExportReadiness_,
  type PmmProjectGraph as PmmProjectGraph_,
  type PmmProjectKeyframeReference as PmmProjectKeyframeReference_,
  type PmmProjectSceneSettings as PmmProjectSceneSettings_,
  type PmmProjectSettings as PmmProjectSettings_,
  type PmmProjectTrackReference as PmmProjectTrackReference_,
  type PmmSceneAsset as PmmSceneAsset_,
  type PmmScenePlan as PmmScenePlan_,
  type PmmSelfShadowKeyframeSummary as PmmSelfShadowKeyframeSummary_,
  type PmmStaticPreviewPlan as PmmStaticPreviewPlan_,
  type PmmTimeline as PmmTimeline_,
  type PmxHeader as PmxHeader_,
  type PmxIndexSizes as PmxIndexSizes_,
  type PmxMetadata as PmxMetadata_,
  type PmxSectionCounts as PmxSectionCounts_,
  type PmxSectionInventory as PmxSectionInventory_,
  type PmxSectionName as PmxSectionName_,
  type PmxSectionRange as PmxSectionRange_,
  type PmxTextEncoding as PmxTextEncoding_,
  resolvePmmAssetPath as resolvePmmAssetPath_,
  resolvePmmAssetReference as resolvePmmAssetReference_,
  type StandardBoneDetectionResult as StandardBoneDetectionResult_,
  type StandardBoneEntry as StandardBoneEntry_,
  type StandardBoneMatch as StandardBoneMatch_,
  type StandardBoneMatchResult as StandardBoneMatchResult_,
  type VmdMetadata as VmdMetadata_,
  type VmdSectionCounts as VmdSectionCounts_,
  type VmdSectionInventory as VmdSectionInventory_,
  type VmdSectionName as VmdSectionName_,
  type VmdSectionRecord as VmdSectionRecord_,
  type VpdBoneBlockInventory as VpdBoneBlockInventory_,
  type VpdBoneCountMismatch as VpdBoneCountMismatch_,
  type VpdBonePose as VpdBonePose_,
  type VpdMetadata as VpdMetadata_,
  type VpdPose as VpdPose_,
  type VpdPoseInventory as VpdPoseInventory_,
  vpdPoseToAnimation as vpdPoseToAnimation_
} from "./parser/index.js";
import {
  createMmdAnimWasmCameraTrack as createMmdAnimWasmCameraTrack_,
  createMmdAnimWasmLightTrack as createMmdAnimWasmLightTrack_,
  DefaultMmdRuntime as DefaultMmdRuntime_,
  exportMmdAnimWasmFormatBytes as exportMmdAnimWasmFormatBytes_,
  exportMmdAnimWasmVmdAnimationJsonBytes as exportMmdAnimWasmVmdAnimationJsonBytes_,
  exportMmdAnimWasmVpdPoseJsonBytes as exportMmdAnimWasmVpdPoseJsonBytes_,
  loadMmdAnimWasmVmd as loadMmdAnimWasmVmd_,
  loadMmdAnimWasmVpd as loadMmdAnimWasmVpd_,
  MmdAnimRuntime as MmdAnimRuntime_,
  type MmdAnimRuntimeOptions as MmdAnimRuntimeOptions_,
  type MmdAnimRuntimeWasmClip as MmdAnimRuntimeWasmClip_,
  type MmdAnimRuntimeWasmHostRig as MmdAnimRuntimeWasmHostRig_,
  type MmdAnimRuntimeWasmHostRigConstructor as MmdAnimRuntimeWasmHostRigConstructor_,
  type MmdAnimRuntimeWasmModel as MmdAnimRuntimeWasmModel_,
  type MmdAnimRuntimeWasmModule as MmdAnimRuntimeWasmModule_,
  type MmdAnimRuntimeWasmRuntimeInstance as MmdAnimRuntimeWasmRuntimeInstance_,
  type MmdHostRigDefinition as MmdHostRigDefinition_,
  type MmdHostRigPose as MmdHostRigPose_,
  parseMmdAnimWasmFormatJson as parseMmdAnimWasmFormatJson_,
  sampleMmdAnimWasmCameraTrackInto as sampleMmdAnimWasmCameraTrackInto_,
  sampleMmdAnimWasmLightTrackInto as sampleMmdAnimWasmLightTrackInto_
} from "./runtime/index.js";
import {
  applyThreeMmdMaterialTextures as applyThreeMmdMaterialTextures_,
  createThreeBufferGeometry as createThreeBufferGeometry_,
  createThreeMmdMaterials as createThreeMmdMaterials_,
  createThreeMorphSplitGeometries as createThreeMorphSplitGeometries_,
  createThreeSkeleton as createThreeSkeleton_,
  type MmdRuntimeMeshSyncSource as MmdRuntimeMeshSyncSource_,
  type MmdWorldMatrixBuffer as MmdWorldMatrixBuffer_,
  type MmdWorldMatrixColumnMajorTuple as MmdWorldMatrixColumnMajorTuple_,
  mmdWorldMatrixToThree as mmdWorldMatrixToThree_,
  resolveMappedTexture as resolveMappedTexture_,
  syncMmdMaterialStates as syncMmdMaterialStates_,
  syncMmdModelShadowFlags as syncMmdModelShadowFlags_,
  syncThreeMmdRuntimeToMesh as syncThreeMmdRuntimeToMesh_,
  syncThreeMmdRuntimeToModel as syncThreeMmdRuntimeToModel_,
  type ThreeMmdAdditionalUvMorphOffset as ThreeMmdAdditionalUvMorphOffset_,
  type ThreeMmdGeometryBuffers as ThreeMmdGeometryBuffers_,
  type ThreeMmdGeometryMaterial as ThreeMmdGeometryMaterial_,
  type ThreeMmdGeometryMorph as ThreeMmdGeometryMorph_,
  type ThreeMmdGeometryOptions as ThreeMmdGeometryOptions_,
  type ThreeMmdMaterialGroup as ThreeMmdMaterialGroup_,
  type ThreeMmdMaterialTextureOptions as ThreeMmdMaterialTextureOptions_,
  type ThreeMmdMorphSplitGeometry as ThreeMmdMorphSplitGeometry_,
  type ThreeMmdQdefBuffers as ThreeMmdQdefBuffers_,
  type ThreeMmdRuntimeSyncTarget as ThreeMmdRuntimeSyncTarget_,
  type ThreeMmdSdefBuffers as ThreeMmdSdefBuffers_,
  type ThreeMmdSkeletonBone as ThreeMmdSkeletonBone_,
  type ThreeMmdSkeletonData as ThreeMmdSkeletonData_,
  type ThreeMmdUvMorphOffset as ThreeMmdUvMorphOffset_,
  type ThreeMmdVertexMorphOffset as ThreeMmdVertexMorphOffset_
} from "./three/index.js";
import {
  createCustomBulletMmdPhysicsBackend as createCustomBulletMmdPhysicsBackend_,
  createDisabledMmdPhysicsBackend as createDisabledMmdPhysicsBackend_,
  type CustomBulletMmdLoaderOptions as CustomBulletMmdLoaderOptions_,
  type CustomBulletMmdModule as CustomBulletMmdModule_,
  type CustomBulletMmdPhysicsBackend as CustomBulletMmdPhysicsBackend_,
  type CustomBulletMmdPhysicsBackendOptions as CustomBulletMmdPhysicsBackendOptions_,
  customBulletMmdScriptPath as customBulletMmdScriptPath_,
  DisabledMmdPhysicsBackend as DisabledMmdPhysicsBackend_,
  type DisabledMmdPhysicsBackendOptions as DisabledMmdPhysicsBackendOptions_,
  loadCustomBulletMmdModule as loadCustomBulletMmdModule_,
  type MmdAnimBulletContactPoint as MmdAnimBulletContactPoint_,
  type MmdAnimBulletModule as MmdAnimBulletModule_,
  type MmdDirectBufferPhysicsBackend as MmdDirectBufferPhysicsBackend_,
  type MmdPhysicsDebugSnapshotNonFiniteMode as MmdPhysicsDebugSnapshotNonFiniteMode_,
  type MmdPhysicsDebugSnapshotNormalizationOptions as MmdPhysicsDebugSnapshotNormalizationOptions_,
  type MmdPhysicsDebugSnapshotNormalizationResult as MmdPhysicsDebugSnapshotNormalizationResult_,
  type MmdPhysicsStepBufferLayout as MmdPhysicsStepBufferLayout_,
  type MmdPhysicsStepBuffers as MmdPhysicsStepBuffers_,
  type MmdPhysicsStepContextSummary as MmdPhysicsStepContextSummary_,
  type MmdPhysicsStepContextValidationOptions as MmdPhysicsStepContextValidationOptions_,
  type MmdPhysicsStepContextValidationResult as MmdPhysicsStepContextValidationResult_,
  normalizeMmdPhysicsDebugSnapshot as normalizeMmdPhysicsDebugSnapshot_,
  resolveCustomBulletMmdScriptUrl as resolveCustomBulletMmdScriptUrl_,
  summarizeMmdPhysicsStepContext as summarizeMmdPhysicsStepContext_,
  validateConcreteMmdPhysicsStepContext as validateConcreteMmdPhysicsStepContext_,
  validateMmdPhysicsStepContext as validateMmdPhysicsStepContext_
} from "./physics/index.js";

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type AccessoryDiagnostic = AccessoryDiagnostic_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type AccessoryMaterial = AccessoryMaterial_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type AccessoryMeshSummary = AccessoryMeshSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type AccessoryParsedManifest = AccessoryParsedManifest_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type AccessoryVacSettings = AccessoryVacSettings_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type AccessoryVertexColor = AccessoryVertexColor_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const createPmmScenePlan = createPmmScenePlan_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const createPmmStaticPreviewPlan = createPmmStaticPreviewPlan_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const detectModelFormat = detectModelFormat_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const detectStandardBones = detectStandardBones_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const FallbackCore = FallbackCore_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type FallbackCore = FallbackCore_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const getStandardBoneDefinitions = getStandardBoneDefinitions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const initCore = initCore_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type InitCoreOptions = InitCoreOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const initCoreWithFallback = initCoreWithFallback_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type MaterialRuntimeState = MaterialRuntimeState_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type MmdModelFormat = MmdModelFormat_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parseAccessory = parseAccessory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parsePmdMetadata = parsePmdMetadata_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parsePmdSectionInventory = parsePmdSectionInventory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parsePmmDocument = parsePmmDocument_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parsePmmManifest = parsePmmManifest_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parsePmxMetadata = parsePmxMetadata_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parsePmxSectionInventory = parsePmxSectionInventory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parseVmd = parseVmd_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parseVmdMetadata = parseVmdMetadata_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parseVmdSectionInventory = parseVmdSectionInventory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parseVpd = parseVpd_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parseVpdMetadata = parseVpdMetadata_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parseVpdPose = parseVpdPose_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const parseVpdPoseInventory = parseVpdPoseInventory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmdHeader = PmdHeader_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmdMetadata = PmdMetadata_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmdSectionCounts = PmdSectionCounts_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmdSectionInventory = PmdSectionInventory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmdSectionName = PmdSectionName_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmdSectionRange = PmdSectionRange_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmAssetReference = PmmAssetReference_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmAssetResolution = PmmAssetResolution_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmAssetResolutionOptions = PmmAssetResolutionOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmAssetSummary = PmmAssetSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmCameraKeyframeSummary = PmmCameraKeyframeSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDisplayState = PmmDisplayState_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentAccessoryBlockSummary = PmmDocumentAccessoryBlockSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentAccessoryKeyframeSummary = PmmDocumentAccessoryKeyframeSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentAccessorySummary = PmmDocumentAccessorySummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentBoneKeyframeSummary = PmmDocumentBoneKeyframeSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentBoneStateSummary = PmmDocumentBoneStateSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentConstraintStateSummary = PmmDocumentConstraintStateSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentCounts = PmmDocumentCounts_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentExpandFlags = PmmDocumentExpandFlags_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentGlobalSummary = PmmDocumentGlobalSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentKeyframeSummary = PmmDocumentKeyframeSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentModelKeyframeSummary = PmmDocumentModelKeyframeSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentModelSections = PmmDocumentModelSections_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentModelSummary = PmmDocumentModelSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentMorphKeyframeSummary = PmmDocumentMorphKeyframeSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentMorphStateSummary = PmmDocumentMorphStateSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentOutsideParentIndexSummary = PmmDocumentOutsideParentIndexSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentOutsideParentStateSummary = PmmDocumentOutsideParentStateSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentSettingsSummary = PmmDocumentSettingsSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentSummary = PmmDocumentSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmDocumentTrackSummary = PmmDocumentTrackSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmGravityKeyframeSummary = PmmGravityKeyframeSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmHeaderTextEntry = PmmHeaderTextEntry_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmLightKeyframeSummary = PmmLightKeyframeSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmManifest = PmmManifest_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmModelSlot = PmmModelSlot_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmModelSlotFlagEntry = PmmModelSlotFlagEntry_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmParsedAssetReference = PmmParsedAssetReference_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmParsedManifest = PmmParsedManifest_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmParserDiagnostic = PmmParserDiagnostic_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectAssetBinding = PmmProjectAssetBinding_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectByteCoverage = PmmProjectByteCoverage_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectByteRange = PmmProjectByteRange_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectExportBlocker = PmmProjectExportBlocker_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectExportReadiness = PmmProjectExportReadiness_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectGraph = PmmProjectGraph_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectKeyframeReference = PmmProjectKeyframeReference_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectSceneSettings = PmmProjectSceneSettings_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectSettings = PmmProjectSettings_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmProjectTrackReference = PmmProjectTrackReference_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmSceneAsset = PmmSceneAsset_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmScenePlan = PmmScenePlan_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmSelfShadowKeyframeSummary = PmmSelfShadowKeyframeSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmStaticPreviewPlan = PmmStaticPreviewPlan_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmmTimeline = PmmTimeline_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmxHeader = PmxHeader_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmxIndexSizes = PmxIndexSizes_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmxMetadata = PmxMetadata_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmxSectionCounts = PmxSectionCounts_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmxSectionInventory = PmxSectionInventory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmxSectionName = PmxSectionName_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmxSectionRange = PmxSectionRange_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type PmxTextEncoding = PmxTextEncoding_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const resolvePmmAssetPath = resolvePmmAssetPath_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const resolvePmmAssetReference = resolvePmmAssetReference_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type StandardBoneDetectionResult = StandardBoneDetectionResult_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type StandardBoneEntry = StandardBoneEntry_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type StandardBoneMatch = StandardBoneMatch_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type StandardBoneMatchResult = StandardBoneMatchResult_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VmdMetadata = VmdMetadata_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VmdSectionCounts = VmdSectionCounts_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VmdSectionInventory = VmdSectionInventory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VmdSectionName = VmdSectionName_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VmdSectionRecord = VmdSectionRecord_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VpdBoneBlockInventory = VpdBoneBlockInventory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VpdBoneCountMismatch = VpdBoneCountMismatch_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VpdBonePose = VpdBonePose_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VpdMetadata = VpdMetadata_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VpdPose = VpdPose_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export type VpdPoseInventory = VpdPoseInventory_;

/** @deprecated Import from "@yohawing/three-mmd-loader/parser". Removed from the root entry in 1.0.0. */
export const vpdPoseToAnimation = vpdPoseToAnimation_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const createMmdAnimWasmCameraTrack = createMmdAnimWasmCameraTrack_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const createMmdAnimWasmLightTrack = createMmdAnimWasmLightTrack_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const DefaultMmdRuntime = DefaultMmdRuntime_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type DefaultMmdRuntime = DefaultMmdRuntime_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const exportMmdAnimWasmFormatBytes = exportMmdAnimWasmFormatBytes_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const exportMmdAnimWasmVmdAnimationJsonBytes = exportMmdAnimWasmVmdAnimationJsonBytes_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const exportMmdAnimWasmVpdPoseJsonBytes = exportMmdAnimWasmVpdPoseJsonBytes_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const loadMmdAnimWasmVmd = loadMmdAnimWasmVmd_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const loadMmdAnimWasmVpd = loadMmdAnimWasmVpd_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const MmdAnimRuntime = MmdAnimRuntime_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdAnimRuntime = MmdAnimRuntime_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdAnimRuntimeOptions = MmdAnimRuntimeOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdAnimRuntimeWasmClip = MmdAnimRuntimeWasmClip_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdAnimRuntimeWasmHostRig = MmdAnimRuntimeWasmHostRig_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdAnimRuntimeWasmHostRigConstructor = MmdAnimRuntimeWasmHostRigConstructor_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdAnimRuntimeWasmModel = MmdAnimRuntimeWasmModel_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdAnimRuntimeWasmModule = MmdAnimRuntimeWasmModule_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdAnimRuntimeWasmRuntimeInstance = MmdAnimRuntimeWasmRuntimeInstance_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdHostRigDefinition = MmdHostRigDefinition_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export type MmdHostRigPose = MmdHostRigPose_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const parseMmdAnimWasmFormatJson = parseMmdAnimWasmFormatJson_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const sampleMmdAnimWasmCameraTrackInto = sampleMmdAnimWasmCameraTrackInto_;

/** @deprecated Import from "@yohawing/three-mmd-loader/runtime". Removed from the root entry in 1.0.0. */
export const sampleMmdAnimWasmLightTrackInto = sampleMmdAnimWasmLightTrackInto_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const applyThreeMmdMaterialTextures = applyThreeMmdMaterialTextures_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const createThreeBufferGeometry = createThreeBufferGeometry_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const createThreeMmdMaterials = createThreeMmdMaterials_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const createThreeMorphSplitGeometries = createThreeMorphSplitGeometries_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const createThreeSkeleton = createThreeSkeleton_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type MmdRuntimeMeshSyncSource = MmdRuntimeMeshSyncSource_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type MmdWorldMatrixBuffer = MmdWorldMatrixBuffer_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type MmdWorldMatrixColumnMajorTuple = MmdWorldMatrixColumnMajorTuple_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const mmdWorldMatrixToThree = mmdWorldMatrixToThree_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const resolveMappedTexture = resolveMappedTexture_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const syncMmdMaterialStates = syncMmdMaterialStates_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const syncMmdModelShadowFlags = syncMmdModelShadowFlags_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const syncThreeMmdRuntimeToMesh = syncThreeMmdRuntimeToMesh_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export const syncThreeMmdRuntimeToModel = syncThreeMmdRuntimeToModel_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdAdditionalUvMorphOffset = ThreeMmdAdditionalUvMorphOffset_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdGeometryBuffers = ThreeMmdGeometryBuffers_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdGeometryMaterial = ThreeMmdGeometryMaterial_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdGeometryMorph = ThreeMmdGeometryMorph_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdGeometryOptions = ThreeMmdGeometryOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdMaterialGroup = ThreeMmdMaterialGroup_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdMaterialTextureOptions = ThreeMmdMaterialTextureOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdMorphSplitGeometry = ThreeMmdMorphSplitGeometry_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdQdefBuffers = ThreeMmdQdefBuffers_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdRuntimeSyncTarget = ThreeMmdRuntimeSyncTarget_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdSdefBuffers = ThreeMmdSdefBuffers_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdSkeletonBone = ThreeMmdSkeletonBone_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdSkeletonData = ThreeMmdSkeletonData_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdUvMorphOffset = ThreeMmdUvMorphOffset_;

/** @deprecated Import from "@yohawing/three-mmd-loader/three". Removed from the root entry in 1.0.0. */
export type ThreeMmdVertexMorphOffset = ThreeMmdVertexMorphOffset_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const createCustomBulletMmdPhysicsBackend = createCustomBulletMmdPhysicsBackend_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const createDisabledMmdPhysicsBackend = createDisabledMmdPhysicsBackend_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type CustomBulletMmdLoaderOptions = CustomBulletMmdLoaderOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type CustomBulletMmdModule = CustomBulletMmdModule_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type CustomBulletMmdPhysicsBackend = CustomBulletMmdPhysicsBackend_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type CustomBulletMmdPhysicsBackendOptions = CustomBulletMmdPhysicsBackendOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const customBulletMmdScriptPath = customBulletMmdScriptPath_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const DisabledMmdPhysicsBackend = DisabledMmdPhysicsBackend_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type DisabledMmdPhysicsBackend = DisabledMmdPhysicsBackend_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type DisabledMmdPhysicsBackendOptions = DisabledMmdPhysicsBackendOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const loadCustomBulletMmdModule = loadCustomBulletMmdModule_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdAnimBulletContactPoint = MmdAnimBulletContactPoint_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdAnimBulletModule = MmdAnimBulletModule_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdDirectBufferPhysicsBackend = MmdDirectBufferPhysicsBackend_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdPhysicsDebugSnapshotNonFiniteMode = MmdPhysicsDebugSnapshotNonFiniteMode_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdPhysicsDebugSnapshotNormalizationOptions = MmdPhysicsDebugSnapshotNormalizationOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdPhysicsDebugSnapshotNormalizationResult = MmdPhysicsDebugSnapshotNormalizationResult_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdPhysicsStepBufferLayout = MmdPhysicsStepBufferLayout_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdPhysicsStepBuffers = MmdPhysicsStepBuffers_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdPhysicsStepContextSummary = MmdPhysicsStepContextSummary_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdPhysicsStepContextValidationOptions = MmdPhysicsStepContextValidationOptions_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export type MmdPhysicsStepContextValidationResult = MmdPhysicsStepContextValidationResult_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const normalizeMmdPhysicsDebugSnapshot = normalizeMmdPhysicsDebugSnapshot_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const resolveCustomBulletMmdScriptUrl = resolveCustomBulletMmdScriptUrl_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const summarizeMmdPhysicsStepContext = summarizeMmdPhysicsStepContext_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const validateConcreteMmdPhysicsStepContext = validateConcreteMmdPhysicsStepContext_;

/** @deprecated Import from "@yohawing/three-mmd-loader/physics". Removed from the root entry in 1.0.0. */
export const validateMmdPhysicsStepContext = validateMmdPhysicsStepContext_;
