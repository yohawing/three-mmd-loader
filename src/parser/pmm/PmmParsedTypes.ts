export interface PmmParsedManifest {
  readonly signature: string;
  readonly version: string;
  readonly parsedVersion?: number;
  readonly byteLength: number;
  readonly projectSettings: PmmProjectSettings;
  readonly timeline: PmmTimeline;
  readonly displayState: PmmDisplayState;
  readonly headerTextEntries: readonly PmmHeaderTextEntry[];
  readonly modelSlots: readonly PmmModelSlot[];
  readonly documentSummary?: PmmDocumentSummary;
  readonly documentGlobalSummary?: PmmDocumentGlobalSummary;
  readonly projectGraph?: PmmProjectGraph;
  readonly assetSummary: PmmAssetSummary;
  readonly assetReferences: readonly PmmParsedAssetReference[];
  readonly modelAssets: readonly PmmSceneAsset[];
  readonly accessoryAssets: readonly PmmSceneAsset[];
  readonly motionAssets: readonly PmmSceneAsset[];
  readonly audioAssets: readonly PmmSceneAsset[];
  readonly imageAssets: readonly PmmSceneAsset[];
  readonly videoAssets: readonly PmmSceneAsset[];
  readonly modelPaths: readonly string[];
  readonly accessoryPaths: readonly string[];
  readonly motionPaths: readonly string[];
  readonly audioPaths: readonly string[];
  readonly imagePaths: readonly string[];
  readonly videoPaths: readonly string[];
  readonly diagnostics: readonly PmmParserDiagnostic[];
}

export interface PmmProjectSettings {
  readonly screenWidth?: number;
  readonly screenHeight?: number;
  readonly timelineFrameCount?: number;
  readonly frameRate?: number;
}

export interface PmmTimeline {
  readonly startFrame?: number;
  readonly endFrameExclusive?: number;
  readonly frameCount?: number;
  readonly frameRate?: number;
  readonly durationSeconds?: number;
}

export interface PmmDisplayState {
  readonly layout: string;
  readonly modelSlotFlags: readonly number[];
  readonly modelSlotFlagEntries: readonly PmmModelSlotFlagEntry[];
  readonly documentExpandFlags?: PmmDocumentExpandFlags;
  readonly selectedModelIndex?: number;
  readonly documentModelCount?: number;
  readonly declaredModelSlotCount?: number;
  readonly modelSlotCount: number;
  readonly nonZeroModelSlotCount: number;
  readonly accessorySlotCount?: number;
  readonly activeModelSlotIndices: readonly number[];
  readonly emptyModelSlotIndices: readonly number[];
  readonly modelSlotFlagCounts: Record<string, number>;
}

export interface PmmDocumentExpandFlags {
  readonly editingCla: boolean;
  readonly cameraPanel: boolean;
  readonly lightPanel: boolean;
  readonly accessoryPanel: boolean;
  readonly bonePanel: boolean;
  readonly morphPanel: boolean;
  readonly selfShadowPanel: boolean;
}

export interface PmmModelSlotFlagEntry {
  readonly slotIndex: number;
  readonly flag: number;
  readonly active: boolean;
}

export interface PmmHeaderTextEntry {
  readonly index: number;
  readonly offset: number;
  readonly offsetEnd: number;
  readonly text: string;
  readonly textBytes: readonly number[];
}

export interface PmmModelSlot {
  readonly slotIndex: number;
  readonly displaySlotIndex?: number;
  readonly offset: number;
  readonly offsetEnd: number;
  readonly modelPathOffset: number;
  readonly trailingZeroPaddingBytes: number;
  readonly nextNonZeroOffset?: number;
  readonly name: string;
  readonly nameBytes: readonly number[];
  readonly englishName: string;
  readonly englishNameBytes: readonly number[];
  readonly modelPath: string;
  readonly normalizedPath: string;
  readonly assetReferenceIndex?: number;
  readonly confidence: string;
}

export interface PmmAssetSummary {
  readonly referenceCount: number;
  readonly highConfidenceCount: number;
  readonly mediumConfidenceCount: number;
  readonly lowConfidenceCount: number;
  readonly kindCounts: Record<string, number>;
  readonly extensionCounts: Record<string, number>;
  readonly confidenceCounts: Record<string, number>;
}

export interface PmmParsedAssetReference {
  readonly path: string;
  readonly normalizedPath: string;
  readonly fileName: string;
  readonly extension: string;
  readonly kind: string;
  readonly offset: number;
  readonly offsetEnd: number;
  readonly confidence: string;
}

export interface PmmSceneAsset {
  readonly referenceIndex: number;
  readonly kindIndex: number;
  readonly path: string;
  readonly normalizedPath: string;
  readonly fileName: string;
  readonly extension: string;
  readonly offset: number;
  readonly offsetEnd: number;
  readonly confidence: string;
}

export interface PmmParserDiagnostic {
  readonly level: string;
  readonly code: string;
  readonly message: string;
}

// --- Document Summary (per-model detail) ---

export interface PmmDocumentSummary {
  readonly source: string;
  readonly selectedModelIndex: number;
  readonly modelCount: number;
  readonly counts: PmmDocumentCounts;
  readonly models: readonly PmmDocumentModelSummary[];
}

export interface PmmDocumentCounts {
  readonly models: number;
  readonly bones: number;
  readonly morphs: number;
  readonly initialBoneKeyframes: number;
  readonly boneKeyframes: number;
  readonly initialMorphKeyframes: number;
  readonly morphKeyframes: number;
  readonly initialModelKeyframes: number;
  readonly modelKeyframes: number;
}

export interface PmmDocumentModelSummary {
  readonly slotIndex: number;
  readonly documentModelIndex: number;
  readonly offset: number;
  readonly offsetEnd: number;
  readonly pathOffset: number;
  readonly name: string;
  readonly englishName: string;
  readonly path: string;
  readonly assetReferenceIndex?: number;
  readonly boneCount: number;
  readonly morphCount: number;
  readonly constraintBoneCount: number;
  readonly outsideParentSubjectBoneCount: number;
  readonly drawOrderIndex: number;
  readonly transformOrderIndex: number;
  readonly selectedBoneIndex: number;
  readonly selectedMorphIndices: readonly number[];
  readonly verticalScroll: number;
  readonly sections: PmmDocumentModelSections;
  readonly initialBoneKeyframes: number;
  readonly initialBoneKeyframeSummaries: readonly PmmDocumentBoneKeyframeSummary[];
  readonly boneKeyframes: number;
  readonly boneKeyframeSummaries: readonly PmmDocumentBoneKeyframeSummary[];
  readonly initialMorphKeyframes: number;
  readonly initialMorphKeyframeSummaries: readonly PmmDocumentMorphKeyframeSummary[];
  readonly morphKeyframes: number;
  readonly morphKeyframeSummaries: readonly PmmDocumentMorphKeyframeSummary[];
  readonly initialModelKeyframes: number;
  readonly modelKeyframes: number;
  readonly initialModelKeyframe: PmmDocumentModelKeyframeSummary;
  readonly modelKeyframeSummaries: readonly PmmDocumentModelKeyframeSummary[];
  readonly lastFrameIndex: number;
  readonly visible: boolean;
  readonly blendEnabled: boolean;
  readonly edgeWidth: number;
  readonly selfShadowEnabled: boolean;
  readonly boneStateSummaries: readonly PmmDocumentBoneStateSummary[];
  readonly morphStateSummaries: readonly PmmDocumentMorphStateSummary[];
  readonly constraintStateSummaries: readonly PmmDocumentConstraintStateSummary[];
  readonly outsideParentStateSummaries: readonly PmmDocumentOutsideParentStateSummary[];
}

export interface PmmDocumentModelSections {
  readonly initialBoneKeyframesOffset: number;
  readonly boneKeyframeCountOffset: number;
  readonly boneKeyframesOffset: number;
  readonly boneKeyframesEndOffset: number;
  readonly initialMorphKeyframesOffset: number;
  readonly morphKeyframeCountOffset: number;
  readonly morphKeyframesOffset: number;
  readonly morphKeyframesEndOffset: number;
  readonly initialModelKeyframeOffset: number;
  readonly modelKeyframeCountOffset: number;
  readonly modelKeyframesOffset: number;
  readonly modelKeyframesEndOffset: number;
  readonly boneStatesOffset: number;
  readonly morphStatesOffset: number;
  readonly constraintStatesOffset: number;
  readonly outsideParentStatesOffset: number;
}

export interface PmmDocumentBoneKeyframeSummary {
  readonly index?: number;
  readonly frameIndex: number;
  readonly previousKeyframeIndex: number;
  readonly nextKeyframeIndex: number;
  readonly interpolation: readonly number[];
  readonly translation: readonly [number, number, number];
  readonly orientation: readonly [number, number, number, number];
  readonly physicsDisabled: boolean;
  readonly selected: boolean;
  readonly offset: number;
  readonly byteLength: number;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
  readonly payloadBytes: readonly number[];
}

export interface PmmDocumentMorphKeyframeSummary {
  readonly index?: number;
  readonly frameIndex: number;
  readonly previousKeyframeIndex: number;
  readonly nextKeyframeIndex: number;
  readonly weight: number;
  readonly selected: boolean;
  readonly offset: number;
  readonly byteLength: number;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
  readonly payloadBytes: readonly number[];
}

export interface PmmDocumentModelKeyframeSummary {
  readonly index?: number;
  readonly frameIndex: number;
  readonly previousKeyframeIndex: number;
  readonly nextKeyframeIndex: number;
  readonly visible: boolean;
  readonly constraintStates: readonly boolean[];
  readonly outsideParentIndices: readonly PmmDocumentOutsideParentIndexSummary[];
  readonly selfShadowEnabled: boolean;
  readonly visibleOffset: number;
  readonly constraintStateCount: number;
  readonly constraintStatesOffset: number;
  readonly constraintStatesByteLength: number;
  readonly outsideParentIndexCount: number;
  readonly outsideParentIndicesOffset: number;
  readonly outsideParentIndicesByteLength: number;
  readonly selfShadowEnabledOffset: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
  readonly payloadBytes: readonly number[];
}

export interface PmmDocumentOutsideParentIndexSummary {
  readonly parentModelIndex: number;
  readonly parentModelBoneIndex: number;
}

export interface PmmDocumentBoneStateSummary {
  readonly translation: readonly [number, number, number];
  readonly orientation: readonly [number, number, number, number];
  readonly dirty: boolean;
  readonly physicsDisabled: boolean;
  readonly selected: boolean;
}

export interface PmmDocumentMorphStateSummary {
  readonly weight: number;
}

export interface PmmDocumentConstraintStateSummary {
  readonly enabled: boolean;
}

export interface PmmDocumentOutsideParentStateSummary {
  readonly parentModelIndex: number;
  readonly parentModelBoneIndex: number;
  readonly subjectBoneIndex: number;
  readonly targetModelIndex: number;
}

// --- Document Global Summary (camera, light, accessories, settings) ---

export interface PmmDocumentGlobalSummary {
  readonly source: string;
  readonly offset: number;
  readonly offsetEnd: number;
  readonly camera: PmmDocumentTrackSummary;
  readonly light: PmmDocumentTrackSummary;
  readonly accessories: PmmDocumentAccessoryBlockSummary;
  readonly settings: PmmDocumentSettingsSummary;
  readonly gravity: PmmDocumentTrackSummary;
  readonly selfShadow: PmmDocumentTrackSummary;
}

export interface PmmDocumentTrackSummary {
  readonly offset: number;
  readonly offsetEnd: number;
  readonly initialKeyframes: number;
  readonly keyframes: number;
  readonly initialKeyframe?: PmmDocumentKeyframeSummary;
  readonly keyframeSummaries: readonly PmmDocumentKeyframeSummary[];
  readonly keyframeCountOffset: number;
  readonly keyframesOffset: number;
  readonly keyframesEndOffset: number;
  readonly stateOffset?: number;
  readonly stateEndOffset?: number;
}

export type PmmDocumentKeyframeSummary =
  | PmmCameraKeyframeSummary
  | PmmLightKeyframeSummary
  | PmmGravityKeyframeSummary
  | PmmSelfShadowKeyframeSummary;

export interface PmmCameraKeyframeSummary {
  readonly kind: "Camera";
  readonly index?: number;
  readonly frameIndex: number;
  readonly previousKeyframeIndex: number;
  readonly nextKeyframeIndex: number;
  readonly distance: number;
  readonly lookAt: readonly [number, number, number];
  readonly angle: readonly [number, number, number];
  readonly parentModelIndex: number;
  readonly parentModelBoneIndex: number;
  readonly interpolation: readonly number[];
  readonly perspectiveView: boolean;
  readonly fov: number;
  readonly selected: boolean;
  readonly distanceOffset: number;
  readonly lookAtOffset: number;
  readonly lookAtByteLength: number;
  readonly angleOffset: number;
  readonly angleByteLength: number;
  readonly parentModelIndexOffset: number;
  readonly parentModelBoneIndexOffset: number;
  readonly interpolationOffset: number;
  readonly interpolationByteLength: number;
  readonly perspectiveViewOffset: number;
  readonly fovOffset: number;
  readonly selectedOffset: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
  readonly payloadBytes: readonly number[];
}

export interface PmmLightKeyframeSummary {
  readonly kind: "Light";
  readonly index?: number;
  readonly frameIndex: number;
  readonly previousKeyframeIndex: number;
  readonly nextKeyframeIndex: number;
  readonly color: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly selected: boolean;
  readonly colorOffset: number;
  readonly colorByteLength: number;
  readonly directionOffset: number;
  readonly directionByteLength: number;
  readonly selectedOffset: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
  readonly payloadBytes: readonly number[];
}

export interface PmmGravityKeyframeSummary {
  readonly kind: "Gravity";
  readonly index?: number;
  readonly frameIndex: number;
  readonly previousKeyframeIndex: number;
  readonly nextKeyframeIndex: number;
  readonly noiseEnabled: boolean;
  readonly noise: number;
  readonly acceleration: number;
  readonly direction: readonly [number, number, number];
  readonly selected: boolean;
  readonly noiseEnabledOffset: number;
  readonly noiseOffset: number;
  readonly accelerationOffset: number;
  readonly directionOffset: number;
  readonly directionByteLength: number;
  readonly selectedOffset: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
  readonly payloadBytes: readonly number[];
}

export interface PmmSelfShadowKeyframeSummary {
  readonly kind: "SelfShadow";
  readonly index?: number;
  readonly frameIndex: number;
  readonly previousKeyframeIndex: number;
  readonly nextKeyframeIndex: number;
  readonly mode: number;
  readonly distance: number;
  readonly selected: boolean;
  readonly modeOffset: number;
  readonly distanceOffset: number;
  readonly selectedOffset: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
  readonly payloadBytes: readonly number[];
}

// --- Accessories ---

export interface PmmDocumentAccessoryBlockSummary {
  readonly offset: number;
  readonly offsetEnd: number;
  readonly selectedAccessoryIndex: number;
  readonly horizontalScroll: number;
  readonly accessoryCount: number;
  readonly keyframes: number;
  readonly accessories: readonly PmmDocumentAccessorySummary[];
}

export interface PmmDocumentAccessorySummary {
  readonly slotIndex: number;
  readonly documentAccessoryIndex: number;
  readonly offset: number;
  readonly offsetEnd: number;
  readonly pathOffset: number;
  readonly name: string;
  readonly path: string;
  readonly assetReferenceIndex?: number;
  readonly drawOrderIndex: number;
  readonly keyframes: number;
  readonly initialKeyframe: PmmDocumentAccessoryKeyframeSummary;
  readonly keyframeSummaries: readonly PmmDocumentAccessoryKeyframeSummary[];
  readonly keyframeCountOffset: number;
  readonly keyframesOffset: number;
  readonly keyframesEndOffset: number;
  readonly stateOffset: number;
  readonly stateEndOffset: number;
  readonly visible: boolean;
  readonly opacity: number;
  readonly parentModelIndex: number;
  readonly parentModelBoneIndex: number;
  readonly scaleFactor: number;
  readonly shadowEnabled: boolean;
  readonly addBlendEnabled: boolean;
}

export interface PmmDocumentAccessoryKeyframeSummary {
  readonly index?: number;
  readonly frameIndex: number;
  readonly previousKeyframeIndex: number;
  readonly nextKeyframeIndex: number;
  readonly visible: boolean;
  readonly opacity: number;
  readonly parentModelIndex: number;
  readonly parentModelBoneIndex: number;
  readonly translation: readonly [number, number, number];
  readonly orientation: readonly [number, number, number];
  readonly scaleFactor: number;
  readonly shadowEnabled: boolean;
  readonly selected: boolean;
  readonly packedOpacityVisibleOffset: number;
  readonly parentModelIndexOffset: number;
  readonly parentModelBoneIndexOffset: number;
  readonly translationOffset: number;
  readonly translationByteLength: number;
  readonly orientationOffset: number;
  readonly orientationByteLength: number;
  readonly scaleFactorOffset: number;
  readonly shadowEnabledOffset: number;
  readonly selectedOffset: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
  readonly payloadBytes: readonly number[];
}

// --- Document Settings ---

export interface PmmDocumentSettingsSummary {
  readonly offset: number;
  readonly offsetEnd: number;
  readonly currentFrameIndex: number;
  readonly currentFrameIndexOffset: number;
  readonly horizontalScroll: number;
  readonly horizontalScrollThumb: number;
  readonly editingMode: number;
  readonly cameraLookMode: number;
  readonly loopEnabled: boolean;
  readonly beginFrameIndexEnabled: boolean;
  readonly beginFrameIndexEnabledOffset: number;
  readonly endFrameIndexEnabled: boolean;
  readonly endFrameIndexEnabledOffset: number;
  readonly beginFrameIndex: number;
  readonly beginFrameIndexOffset: number;
  readonly endFrameIndex: number;
  readonly endFrameIndexOffset: number;
  readonly audioEnabled: boolean;
  readonly audioPath: string;
  readonly audioPathOffset: number;
  readonly backgroundVideoOffset: readonly [number, number];
  readonly backgroundVideoScaleFactor: number;
  readonly backgroundVideoPath: string;
  readonly backgroundVideoPathOffset: number;
  readonly backgroundVideoEnabled: boolean;
  readonly backgroundImageOffset: readonly [number, number];
  readonly backgroundImageScaleFactor: number;
  readonly backgroundImagePath: string;
  readonly backgroundImagePathOffset: number;
  readonly backgroundImageEnabled: boolean;
  readonly informationShown: boolean;
  readonly gridAndAxisShown: boolean;
  readonly groundShadowShown: boolean;
  readonly preferredFps: number;
  readonly screenCaptureMode: number;
  readonly accessoryIndexAfterModels: number;
  readonly groundShadowBrightness: number;
  readonly translucentGroundShadowEnabled: boolean;
  readonly physicsSimulationMode: number;
  readonly edgeColor: readonly [number, number, number];
  readonly blackBackgroundEnabled: boolean;
  readonly cameraLookAtModelIndex: number;
  readonly cameraLookAtModelBoneIndex: number;
  readonly unknownMatrixOffset: number;
  readonly unknownMatrixEndOffset: number;
  readonly followingLookAtEnabled: boolean;
  readonly physicsGroundEnabled: boolean;
  readonly currentFrameIndexInTextField: number;
  readonly currentFrameIndexInTextFieldOffset: number;
  readonly modelSelectionFooterPresent: boolean;
  readonly modelSelectionFooterOffset?: number;
  readonly modelSelectionFooterEndOffset?: number;
}

// --- Project Graph ---

export interface PmmProjectGraph {
  readonly source: string;
  readonly version: string;
  readonly parsedVersion?: number;
  readonly timeline: PmmTimeline;
  readonly displayState: PmmDisplayState;
  readonly assetSummary: PmmAssetSummary;
  readonly assetReferences: readonly PmmParsedAssetReference[];
  readonly models: readonly PmmDocumentModelSummary[];
  readonly global: PmmDocumentGlobalSummary;
  readonly modelCounts: PmmDocumentCounts;
  readonly accessoryCount: number;
  readonly accessoryKeyframes: number;
  readonly trackReferences: readonly PmmProjectTrackReference[];
  readonly keyframeReferences: readonly PmmProjectKeyframeReference[];
  readonly byteCoverage: PmmProjectByteCoverage;
  readonly sceneSettings: PmmProjectSceneSettings;
  readonly assetBindings: readonly PmmProjectAssetBinding[];
  readonly exportReadiness: PmmProjectExportReadiness;
}

export interface PmmProjectSceneSettings {
  readonly offset: number;
  readonly offsetEnd: number;
  readonly currentFrameIndex: number;
  readonly currentFrameIndexInTextField: number;
  readonly beginFrameIndexEnabled: boolean;
  readonly endFrameIndexEnabled: boolean;
  readonly beginFrameIndex: number;
  readonly endFrameIndex: number;
  readonly preferredFps: number;
  readonly loopEnabled: boolean;
  readonly audioEnabled: boolean;
  readonly audioPath: string;
  readonly audioAssetReferenceIndex?: number;
  readonly backgroundVideoEnabled: boolean;
  readonly backgroundVideoPath: string;
  readonly backgroundVideoAssetReferenceIndex?: number;
  readonly backgroundVideoOffset: readonly [number, number];
  readonly backgroundVideoScaleFactor: number;
  readonly backgroundImageEnabled: boolean;
  readonly backgroundImagePath: string;
  readonly backgroundImageAssetReferenceIndex?: number;
  readonly backgroundImageOffset: readonly [number, number];
  readonly backgroundImageScaleFactor: number;
}

export interface PmmProjectAssetBinding {
  readonly scope: string;
  readonly assetKind: string;
  readonly ownerIndex?: number;
  readonly documentIndex?: number;
  readonly ownerName?: string;
  readonly path: string;
  readonly pathOffset?: number;
  readonly assetReferenceIndex?: number;
  readonly assetReferenceOffset?: number;
  readonly assetReferenceEndOffset?: number;
  readonly assetReferenceConfidence?: string;
}

export interface PmmProjectExportReadiness {
  readonly losslessParsedByteExportSupported: boolean;
  readonly semanticGraphExportSupported: boolean;
  readonly sourceBytePreservationRequired: boolean;
  readonly blockerCount: number;
  readonly blockers: readonly PmmProjectExportBlocker[];
}

export interface PmmProjectExportBlocker {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
  readonly scope?: string;
  readonly kind?: string;
  readonly count?: number;
  readonly coverageRatio?: number;
}

export interface PmmProjectTrackReference {
  readonly scope: string;
  readonly trackKind: string;
  readonly ownerIndex?: number;
  readonly documentIndex?: number;
  readonly ownerName?: string;
  readonly initialKeyframes: number;
  readonly keyframes: number;
  readonly initialKeyframesOffset?: number;
  readonly keyframeCountOffset?: number;
  readonly keyframesOffset: number;
  readonly keyframesEndOffset: number;
  readonly stateOffset?: number;
  readonly stateEndOffset?: number;
}

export interface PmmProjectKeyframeReference {
  readonly scope: string;
  readonly trackKind: string;
  readonly ownerIndex?: number;
  readonly documentIndex?: number;
  readonly ownerName?: string;
  readonly initial: boolean;
  readonly keyframeIndex?: number;
  readonly frameIndex: number;
  readonly previousKeyframeIndex: number;
  readonly nextKeyframeIndex: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
}

export interface PmmProjectByteCoverage {
  readonly offset: number;
  readonly offsetEnd: number;
  readonly byteLength: number;
  readonly coveredByteLength: number;
  readonly coverageRatio: number;
  readonly gapCount: number;
  readonly gaps: readonly PmmProjectByteRange[];
  readonly rangeCount: number;
  readonly ranges: readonly PmmProjectByteRange[];
}

export interface PmmProjectByteRange {
  readonly scope: string;
  readonly kind: string;
  readonly ownerIndex?: number;
  readonly documentIndex?: number;
  readonly name?: string;
  readonly offset: number;
  readonly offsetEnd: number;
  readonly byteLength: number;
}
