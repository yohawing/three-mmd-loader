import {
  ThreeMmdLoader,
  createMmdTextureMapFromFiles,
  findMmdModelFiles,
  normalizeMmdRelativePath,
  syncMmdSpecularDirection
} from "../../../dist/three/index.js";
import { detectStandardBones } from "../../../dist/parser/index.js";
import { MmdAnimRuntime, DefaultMmdRuntime } from "../../../dist/runtime/index.js";
import { DDSLoader } from "three/addons/loaders/DDSLoader.js";

import {
  createPhysicsBackend,
  disposeActivePhysicsBackend,
  ensurePhysicsBackendReady,
  registerPhysicsBackendForModel,
  releasePhysicsBackend
} from "./physics-backend.js";
import { loadAudioFile, isAudioFile } from "./audio-loading.js";
import { loadCameraFile } from "./camera-loading.js";
import { hideCreditPopup, showModelCredits } from "./credits.js";
import { hideColliderHelpers, refreshDebugPanelState, restoreDebugMaterials, setOutlineHidden, showColliderHelpers } from "./debug.js";
import { clearBoneDetectionPanel, clearDiagnosticsPanel, reportTextureDiagnostics, updateBoneDetectionPanel, updateDiagnosticsPanel } from "./diagnostics.js";
import { clearLoadedFileSwitcher, dom, setLoadedFileSwitcherOptions, setStatus, updateChromeHeights, updatePlaybackDisplay, updateStageState, updateTransportState } from "./dom.js";
import { disposeModelResources } from "./dispose.js";
import { loadMotion, loadPose, findVmdFiles, classifyVmdFiles, updateMotionSwitcher, resetMotionSwitcherState } from "./motion-loading.js";
import { renderStillFrame, syncAudioToMotionTime, syncPlaybackToCurrentAudioState } from "./playback.js";
import { createViewerLoadProfile, describeViewerSource, resetViewerFrameProfile } from "./performance.js";
import { createViewerRuntimeOptions, currentMotionDurationSeconds, state } from "./state.js";
import { getWorkerRuntimeFactory, isWorkerRuntimeEnabled } from "./runtime-worker.js";
import { adaptCameraDepthRange, fitCameraToObject } from "./scene-setup.js";
import { labelFromUrl } from "./url-label.js";
import {
  applyViewerPipelineToModel,
  clearViewerPipelineModel,
  createViewerModelLoadOptions,
  isTslViewerPipeline,
  syncMmdTslDedicatedShadowVisibility
} from "./viewer-pipeline.js";

let modelLoadGeneration = 0;

function beginModelLoad() {
  return ++modelLoadGeneration;
}

function createLoadGuard(generation, loadOptions) {
  return () =>
    generation === modelLoadGeneration &&
    (!loadOptions.shouldCommit || loadOptions.shouldCommit());
}

export async function loadModelFromUrl(url, loadOptions = {}) {
  const generation = beginModelLoad();
  const profile = createViewerLoadProfile(`url:${url}`);
  profile?.mark("start");
  const label = labelFromUrl(url);
  try {
    setStatus(`Loading ${url}`, "loading");
    const bytes = await fetchBytes(url);
    profile?.mark("bytes");
    return await loadModel(
      bytes,
      label,
      () => createUrlTextureLoader(url),
      profile,
      {
        id: `url:${url}`,
        name: label,
        source: url
      },
      loadOptions,
      generation
    );
  } catch (error) {
    profile?.mark("error");
    profile?.measure("source-bytes", "start", "bytes");
    profile?.measure("failed-total", "start", "error");
    profile?.report();
    if (generation === modelLoadGeneration && (!loadOptions.shouldCommit || loadOptions.shouldCommit())) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
    return false;
  }
}

export async function loadSecondaryModelFromUrl(url, loadOptions = {}) {
  const loaded = await loadModelFromUrl(url, { ...loadOptions, secondary: true, autoFitCamera: false });
  if (loaded && state.secondaryModel) {
    state.secondaryModelSource = url;
  }
  return loaded;
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadModel(source, label = source.name ?? "model", modelLoader, profile, switcherEntry, loadOptions = {}, generation = beginModelLoad()) {
  const isCurrentLoad = createLoadGuard(generation, loadOptions);
  const isSecondary = loadOptions.secondary === true && state.currentModel !== undefined;
  const loadProfile = profile ?? createViewerLoadProfile(describeViewerSource(source, label));
  if (!profile) {
    loadProfile?.mark("start");
  }
  loadProfile?.mark("load-start");
  let loadedModel;
  let previousSecondaryState;
  try {
    if (!isCurrentLoad()) {
      loadProfile?.mark("cancelled");
      return false;
    }
    setStatus(`Loading model: ${label}`, "loading");
    const shouldAutoFitCamera = shouldAutoFitCameraOnModelLoad(loadOptions);
    const preservedMotion = state.currentMotion;
    if (!isSecondary) {
      resetFolderModelState();
      clearModel({
        preserveMotion: Boolean(preservedMotion),
        preserveModelSwitcher: true,
        preserveLoadGeneration: true
      });
    }
    loadProfile?.mark("cleared");
    const resolvedModelLoader =
      typeof modelLoader === "function"
        ? await modelLoader()
        : await (modelLoader ?? createModelLoader());
    loadProfile?.mark("loader-ready");
    loadedModel = await loadManagedModel(resolvedModelLoader, source);
    if (!isCurrentLoad()) {
      disposeModelResources(loadedModel);
      loadProfile?.mark("cancelled");
      return false;
    }
    previousSecondaryState = isSecondary
      ? {
          model: state.secondaryModel,
          source: state.secondaryModelSource,
          motion: state.secondaryMotion
        }
      : undefined;
    if (isSecondary) {
      if (!state.characterModels[0]) {
        state.characterModels[0] = state.currentModel;
      }
      state.secondaryModel = loadedModel;
      state.secondaryModelSource = undefined;
      state.secondaryMotion = undefined;
      state.characterModels[1] = loadedModel;
      state.characterModels.length = 2;
    } else {
      state.currentModel = loadedModel;
      state.characterModels[0] = loadedModel;
      state.characterModels.length = 1;
    }
    await applyViewerPipelineToModel(loadedModel, label, { shouldCommit: isCurrentLoad });
    if (!isCurrentLoad()) {
      if (isSecondary ? state.secondaryModel === loadedModel : state.currentModel === loadedModel) {
        if (isSecondary) {
          restoreSecondaryModelAfterLoadFailure(loadedModel, previousSecondaryState);
        } else {
          state.currentModel = undefined;
          state.characterModels.length = 0;
          disposeModelResources(loadedModel);
        }
      } else {
        disposeModelResources(loadedModel);
      }
      loadProfile?.mark("cancelled");
      return false;
    }
    loadProfile?.mark("model-loaded");
    if (!isTslViewerPipeline()) {
      syncMmdSpecularDirection(loadedModel.mesh.material, state.keyLight);
    }
    addModelToScene(loadedModel);
    loadProfile?.mark("scene-ready");
    const selectedModelEntry = switcherEntry ?? createModelSwitcherEntry(source, label);
    if (!isSecondary) {
      state.currentFolderTextureMap = loadOptions.folderTextureMap ?? state.currentFolderTextureMap;
      state.currentFolderFiles = loadOptions.folderFiles ?? (source instanceof window.File ? [source] : []);
      state.currentFolderPmxFiles = loadOptions.folderModelFiles ?? [selectedModelEntry];
      updateModelSwitcher(selectedModelEntry);
      state.elapsedSeconds = 0;
      dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
      dom.timeline.value = 0;
      updatePlaybackDisplay();
    }
    if (shouldAutoFitCamera) {
      frameCurrentModel();
    } else {
      adaptCameraDepthRange();
    }
    if (state.pendingMotionSource && !preservedMotion && !isSecondary) {
      await loadMotion(state.pendingMotionSource, state.pendingMotionLabel);
      if (!isCurrentLoad()) {
        if (isSecondary) {
          restoreSecondaryModelAfterLoadFailure(loadedModel, previousSecondaryState);
        }
        loadProfile?.mark("cancelled");
        return false;
      }
    } else if (state.currentMotion?.animation !== undefined) {
      await ensurePhysicsBackendReady();
      if (!isCurrentLoad()) {
        if (isSecondary) {
          restoreSecondaryModelAfterLoadFailure(loadedModel, previousSecondaryState);
        }
        loadProfile?.mark("cancelled");
        return false;
      }
      loadedModel.setAnimation(state.currentMotion);
      if (!isSecondary) {
        dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
        syncAudioToMotionTime();
        updateTransportState();
        syncPlaybackToCurrentAudioState();
      }
    } else {
      loadedModel.setAnimation(state.restPoseAnimation);
    }
    loadProfile?.mark("animation-ready");
    setStatus("", "ready");
    if (isSecondary) {
      if (state.debugOutlineHidden) {
        setOutlineHidden(true);
      }
    } else {
      reportTextureDiagnostics(state.currentModel);
      updateDiagnosticsPanel(state.currentModel);
      updateBoneDetectionPanel(detectStandardBones(state.currentModel.mesh.userData.mmdModel?.metadata?.bones ?? []));
      showModelCredits(state.currentModel, label);
      if (state.debugOutlineHidden) {
        setOutlineHidden(true);
      }
    }
    updateStageState();
    if (state.showDebugColliders) {
      showColliderHelpers();
    }
    await renderStillFrame();
    if (!isCurrentLoad()) {
      loadProfile?.mark("cancelled");
      return false;
    }
    refreshDebugPanelState();
    loadProfile?.mark("first-render");
    resetViewerFrameProfile();
    if (previousSecondaryState?.model) {
      state.scene.remove(previousSecondaryState.model.root);
      disposeModelResources(previousSecondaryState.model);
    }
    return true;
  } catch (error) {
    loadProfile?.mark("error");
    if (loadedModel) {
      if (isSecondary) {
        restoreSecondaryModelAfterLoadFailure(loadedModel, previousSecondaryState);
      } else {
        disposeFailedPrimaryModel(loadedModel);
      }
    }
    if (generation === modelLoadGeneration) {
      if (!isSecondary) {
        resetFolderModelState();
      }
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
    updateStageState();
    return false;
  } finally {
    measureModelLoadProfile(loadProfile);
  }
}

export async function loadModelFolder(files, loadOptions = {}) {
  const generation = beginModelLoad();
  const isCurrentLoad = createLoadGuard(generation, loadOptions);
  const shouldAutoFitCamera = shouldAutoFitCameraOnModelLoad(loadOptions);
  resetFolderModelState();
  resetMotionSwitcherState();
  const modelFiles = findModelFiles(files);
  const modelFile = modelFiles[0];
  if (!modelFile) {
    setStatus("No PMX or PMD model found in the selected folder.", "error");
    return;
  }

  const textureMap = createFolderTextureMap(files, modelFile);
  const folderName =
    normalizeMmdRelativePath(modelFile.webkitRelativePath || modelFile.name).split("/")[0] || "folder";
  const profile = createViewerLoadProfile(`folder:${folderName}`);
  profile?.mark("start");
  profile?.mark("texture-map");
  state.currentFolderTextureMap = textureMap;
  state.currentFolderFiles = files;
  state.currentFolderPmxFiles = modelFiles;
  updateModelSwitcher(modelFile);

  let loadedModel;
  try {
    profile?.mark("load-start");
    setStatus(`Loading model folder: ${folderName}`, "loading");
    const preservedMotion = state.currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true,
      preserveLoadGeneration: true
    });
    profile?.mark("cleared");
    const folderLoader = await createModelLoader({ textureMap });
    profile?.mark("loader-ready");
    loadedModel = await loadManagedModel(folderLoader, modelFile);
    if (!isCurrentLoad()) {
      disposeModelResources(loadedModel);
      profile?.mark("cancelled");
      return;
    }
    state.currentModel = loadedModel;
    state.characterModels[0] = loadedModel;
    state.characterModels.length = 1;
    await applyViewerPipelineToModel(state.currentModel, modelFile.name, { shouldCommit: isCurrentLoad });
    if (!isCurrentLoad()) {
      if (state.currentModel === loadedModel) {
        state.currentModel = undefined;
        state.characterModels.length = 0;
        disposeModelResources(loadedModel);
      }
      profile?.mark("cancelled");
      return;
    }
    profile?.mark("model-loaded");
    if (!isTslViewerPipeline()) {
      syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
    }
    addModelToScene(state.currentModel);
    profile?.mark("scene-ready");
    state.elapsedSeconds = 0;
    dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
    dom.timeline.value = 0;
    updatePlaybackDisplay();
    if (shouldAutoFitCamera) {
      frameCurrentModel();
    } else {
      adaptCameraDepthRange();
    }
    if (state.pendingMotionSource && !preservedMotion) {
      await loadMotion(state.pendingMotionSource, state.pendingMotionLabel);
      if (!isCurrentLoad()) {
        profile?.mark("cancelled");
        return;
      }
    } else if (state.currentMotion?.animation !== undefined) {
      await ensurePhysicsBackendReady();
      if (!isCurrentLoad()) {
        profile?.mark("cancelled");
        return;
      }
      state.currentModel.setAnimation(state.currentMotion);
      dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
      syncAudioToMotionTime();
      updateTransportState();
      syncPlaybackToCurrentAudioState();
    } else {
      state.currentModel.setAnimation(state.restPoseAnimation);
    }
    profile?.mark("animation-ready");
    setStatus("", "ready");
    reportTextureDiagnostics(state.currentModel);
    updateDiagnosticsPanel(state.currentModel);
    updateBoneDetectionPanel(detectStandardBones(state.currentModel.mesh.userData.mmdModel?.metadata?.bones ?? []));
    showModelCredits(state.currentModel, modelFile.name);
    updateStageState();
    if (state.debugOutlineHidden) {
      setOutlineHidden(true);
    }
    if (state.showDebugColliders) {
      showColliderHelpers();
    }
    await renderStillFrame();
    if (!isCurrentLoad()) {
      profile?.mark("cancelled");
      return;
    }
    refreshDebugPanelState();
    profile?.mark("first-render");
    resetViewerFrameProfile();
    resetViewerFrameProfile();
  } catch (error) {
    profile?.mark("error");
    disposeFailedPrimaryModel(loadedModel);
    if (generation === modelLoadGeneration) {
      resetFolderModelState();
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
    updateStageState();
  } finally {
    measureModelLoadProfile(profile);
  }
}

export async function switchFolderModel(modelFile, loadOptions = {}) {
  if (!state.currentFolderTextureMap) {
    return;
  }
  const generation = beginModelLoad();
  const isCurrentLoad = createLoadGuard(generation, loadOptions);
  const shouldAutoFitCamera = shouldAutoFitCameraOnModelLoad(loadOptions);

  const profile = createViewerLoadProfile(`switch:${modelFile.name}`);
  profile?.mark("start");
  profile?.mark("load-start");
  let loadedModel;
  try {
    setStatus(`Switching to ${modelFile.name}`, "loading");
    const preservedMotion = state.currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true,
      preserveLoadGeneration: true
    });
    profile?.mark("cleared");
    const folderLoader = await createModelLoader({ textureMap: state.currentFolderTextureMap });
    profile?.mark("loader-ready");
    loadedModel = await loadManagedModel(folderLoader, modelFile);
    if (!isCurrentLoad()) {
      disposeModelResources(loadedModel);
      profile?.mark("cancelled");
      return;
    }
    state.currentModel = loadedModel;
    state.characterModels[0] = loadedModel;
    state.characterModels.length = 1;
    await applyViewerPipelineToModel(state.currentModel, modelFile.name, { shouldCommit: isCurrentLoad });
    if (!isCurrentLoad()) {
      if (state.currentModel === loadedModel) {
        state.currentModel = undefined;
        state.characterModels.length = 0;
        disposeModelResources(loadedModel);
      }
      profile?.mark("cancelled");
      return;
    }
    profile?.mark("model-loaded");
    if (!isTslViewerPipeline()) {
      syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
    }
    addModelToScene(state.currentModel);
    updateModelSwitcher(modelFile);
    profile?.mark("scene-ready");
    state.elapsedSeconds = 0;
    dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
    dom.timeline.value = 0;
    updatePlaybackDisplay();
    if (shouldAutoFitCamera) {
      frameCurrentModel();
    } else {
      adaptCameraDepthRange();
    }
    if (state.currentMotion?.animation !== undefined) {
      await ensurePhysicsBackendReady();
      if (!isCurrentLoad()) {
        profile?.mark("cancelled");
        return;
      }
      state.currentModel.setAnimation(state.currentMotion);
      dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
      syncAudioToMotionTime();
      updateTransportState();
      syncPlaybackToCurrentAudioState();
    } else {
      state.currentModel.setAnimation(state.restPoseAnimation);
    }
    profile?.mark("animation-ready");
    setStatus("", "ready");
    reportTextureDiagnostics(state.currentModel);
    updateDiagnosticsPanel(state.currentModel);
    updateBoneDetectionPanel(detectStandardBones(state.currentModel.mesh.userData.mmdModel?.metadata?.bones ?? []));
    showModelCredits(state.currentModel, modelFile.name);
    updateStageState();
    if (state.debugOutlineHidden) {
      setOutlineHidden(true);
    }
    if (state.showDebugColliders) {
      showColliderHelpers();
    }
    await renderStillFrame();
    if (!isCurrentLoad()) {
      profile?.mark("cancelled");
      return;
    }
    refreshDebugPanelState();
    profile?.mark("first-render");
  } catch (error) {
    profile?.mark("error");
    disposeFailedPrimaryModel(loadedModel);
    if (generation === modelLoadGeneration) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
    updateStageState();
  } finally {
    measureModelLoadProfile(profile);
  }
}

export function clearModel(options = {}) {
  if (!options.preserveLoadGeneration) {
    beginModelLoad();
  }
  hideColliderHelpers();
  restoreDebugMaterials();
  if (state.currentModel) {
    state.scene.remove(state.currentModel.root);
    disposeModelResources(state.currentModel);
  }
  if (state.secondaryModel) {
    state.scene.remove(state.secondaryModel.root);
    disposeModelResources(state.secondaryModel);
  }
  state.currentModel = undefined;
  state.secondaryModel = undefined;
  state.secondaryModelSource = undefined;
  state.secondaryMotion = undefined;
  state.characterModels.length = 0;
  clearViewerPipelineModel();
  hideCreditPopup();
  clearDiagnosticsPanel();
  clearBoneDetectionPanel();
  disposeActivePhysicsBackend();
  if (!options.preserveMotion) {
    state.currentMotion = undefined;
    state.currentPoseSource = undefined;
    state.currentPoseLabel = undefined;
  }
  if (!options.preserveModelSwitcher) {
    resetFolderModelState();
  }
  if (!options.preserveMotion) {
    resetMotionSwitcherState();
  }
  state.elapsedSeconds = 0;
  if (dom.timeline) {
    dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
    dom.timeline.value = 0;
  }
  updatePlaybackDisplay();
  updateStageState();
  updateTransportState();
}

export function clearSecondaryModel(options = {}) {
  if (!options.preserveLoadGeneration) {
    beginModelLoad();
  }
  if (state.secondaryModel) {
    state.scene.remove(state.secondaryModel.root);
    disposeModelResources(state.secondaryModel);
  }
  state.secondaryModel = undefined;
  state.secondaryModelSource = undefined;
  state.secondaryMotion = undefined;
  state.characterModels.length = state.currentModel ? 1 : 0;
  const durationSeconds = Math.max(currentMotionDurationSeconds(), 0.001);
  state.elapsedSeconds = Math.min(state.elapsedSeconds, durationSeconds);
  if (dom.timeline) {
    dom.timeline.max = durationSeconds;
    dom.timeline.value = state.elapsedSeconds;
  }
  adaptCameraDepthRange();
  updatePlaybackDisplay();
  updateStageState();
  updateTransportState();
}

export function frameCurrentModel() {
  if (!state.currentModel) {
    return false;
  }
  fitCameraToObject(state.currentModel.mesh);
  return true;
}

export function loadModelFile(file, loadOptions = {}) {
  return loadModel(file, file.name, undefined, undefined, undefined, loadOptions);
}

export function loadSecondaryModelFile(file, loadOptions = {}) {
  return loadModelFile(file, { ...loadOptions, secondary: true, autoFitCamera: false });
}

export async function loadSecondaryModelFolder(files, loadOptions = {}) {
  const modelFiles = findModelFiles(files);
  const modelFile = modelFiles[0];
  if (!modelFile) {
    setStatus("No PMX or PMD model found in the selected folder.", "error");
    return false;
  }
  const textureMap = createFolderTextureMap(files, modelFile);
  return loadModel(
    modelFile,
    modelFile.name,
    () => createModelLoader({ textureMap }),
    undefined,
    undefined,
    {
      ...loadOptions,
      secondary: true,
      autoFitCamera: false,
      folderTextureMap: textureMap,
      folderFiles: files,
      folderModelFiles: modelFiles
    }
  );
}

function restoreSecondaryModelAfterLoadFailure(model, previousState) {
  if (!model) {
    return;
  }
  state.scene?.remove(model.root);
  if (state.secondaryModel === model) {
    state.secondaryModel = previousState?.model;
    state.secondaryModelSource = previousState?.source;
    state.secondaryMotion = previousState?.motion;
    state.characterModels[1] = previousState?.model;
    state.characterModels.length = previousState?.model ? 2 : 1;
  }
  disposeModelResources(model);
}

function disposeFailedPrimaryModel(model) {
  if (!model) {
    return;
  }
  state.scene?.remove(model.root);
  if (state.currentModel === model) {
    state.currentModel = undefined;
    state.characterModels.length = 0;
  }
  disposeModelResources(model);
}

function shouldAutoFitCameraOnModelLoad(loadOptions) {
  return (
    loadOptions.autoFitCamera !== false &&
    !state.currentModel &&
    !state.currentBackground &&
    !state.currentCameraMotion
  );
}

function addModelToScene(model) {
  state.scene.add(model.root);
  syncMmdTslDedicatedShadowVisibility(model.root);
}

export function bindDropTarget() {
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    dom.stage?.classList.add("is-dragging");
  });
  window.addEventListener("dragleave", () => {
    dom.stage?.classList.remove("is-dragging");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.stage?.classList.remove("is-dragging");
    void handleDroppedFiles(event.dataTransfer);
  });
}

export async function handleDroppedFiles(dataTransfer) {
  const files = await collectDroppedFiles(dataTransfer);
  const modelFile = findModelFile(files);
  const vmdFiles = findVmdFiles(files);
  const { motionFiles, cameraFiles } = await classifyVmdFiles(vmdFiles);
  const shouldLoadModelFolder =
    modelFile && files.some((file) => file.webkitRelativePath?.includes("/"));
  if (motionFiles.length > 0) {
    state.currentMotionVmdFiles = motionFiles;
    updateMotionSwitcher(motionFiles[0]);
    state.pendingMotionSource = undefined;
    state.pendingMotionLabel = undefined;
  } else if (vmdFiles.length === 0) {
    resetMotionSwitcherState();
  }
  if (shouldLoadModelFolder) {
    await loadModelFolder(files);
  } else if (modelFile) {
    await loadModel(modelFile);
  }
  if (motionFiles.length > 0) {
    state.currentMotionVmdFiles = motionFiles;
    updateMotionSwitcher(motionFiles[0]);
    await loadMotion(motionFiles[0]);
  }
  if (cameraFiles.length > 0) {
    await loadCameraFile(cameraFiles[0]);
  }
  for (const file of files) {
    if (file === modelFile || vmdFiles.includes(file)) {
      continue;
    }
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".pmx") || lowerName.endsWith(".pmd")) {
      if (!shouldLoadModelFolder) {
        await loadModel(file, file.name, undefined, undefined, undefined, { secondary: true, autoFitCamera: false });
      }
    } else if (lowerName.endsWith(".vpd")) {
      await loadPose(file);
    } else if (isAudioFile(file)) {
      loadAudioFile(file);
    }
  }
}

async function collectDroppedFiles(dataTransfer) {
  const items = Array.from(dataTransfer?.items ?? []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (entries.length === 0) {
    return Array.from(dataTransfer?.files ?? []);
  }
  const files = [];
  for (const entry of entries) {
    await collectEntryFiles(entry, "", files);
  }
  return files;
}

async function collectEntryFiles(entry, directory, files) {
  if (entry.isFile) {
    const file = await readFileEntry(entry);
    const relativePath = `${directory}${file.name}`;
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: relativePath
    });
    files.push(file);
    return;
  }
  if (!entry.isDirectory) {
    return;
  }
  const reader = entry.createReader();
  const childDirectory = `${directory}${entry.name}/`;
  while (true) {
    const entries = await readDirectoryEntries(reader);
    if (entries.length === 0) {
      break;
    }
    for (const child of entries) {
      await collectEntryFiles(child, childDirectory, files);
    }
  }
}

function readFileEntry(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

export function findModelFile(files) {
  return findModelFiles(files)[0];
}

export const findModelFiles = findMmdModelFiles;

export function modelFileKey(file) {
  if (typeof file.id === "string") {
    return file.id;
  }
  if (typeof file.source === "string") {
    return `url:${file.source}`;
  }
  return normalizeMmdRelativePath(file.webkitRelativePath || file.name);
}

function createModelSwitcherEntry(source, label) {
  if (source instanceof window.File) {
    return source;
  }
  return { name: label };
}

export function updateModelSwitcher(selectedFile) {
  setLoadedFileSwitcherOptions(
    dom.modelSwitcher,
    state.currentFolderPmxFiles.map((file) => ({
      value: modelFileKey(file),
      label: file.name
    })),
    modelFileKey(selectedFile)
  );
  if (dom.modelControl) {
    dom.modelControl.hidden = state.currentFolderPmxFiles.length === 0;
  }
  updateChromeHeights();
}

export function resetFolderModelState() {
  state.currentFolderTextureMap = undefined;
  state.currentFolderFiles = [];
  state.currentFolderPmxFiles = [];
  clearLoadedFileSwitcher(dom.modelSwitcher);
  if (dom.modelControl) {
    dom.modelControl.hidden = true;
  }
  updateChromeHeights();
}

export const createFolderTextureMap = createMmdTextureMapFromFiles;

function measureModelLoadProfile(profile) {
  profile?.measure("source-bytes", "start", "bytes");
  profile?.measure("texture-map", "start", "texture-map");
  profile?.measure("clear-model", "load-start", "cleared");
  profile?.measure("create-loader", "cleared", "loader-ready");
  profile?.measure("loader-loadModel", "loader-ready", "model-loaded");
  profile?.measure("scene-setup", "model-loaded", "scene-ready");
  profile?.measure("animation-bind", "scene-ready", "animation-ready");
  profile?.measure("first-render", "animation-ready", "first-render");
  profile?.measure("total", "start", "first-render");
  profile?.measure("failed-total", "start", "error");
  profile?.report();
}

export async function createUrlTextureLoader(modelUrl) {
  return await createModelLoader({
    textureResolver: {
      async resolve(path) {
        return new URL(
          path.replaceAll("\\", "/"),
          new URL(".", new URL(modelUrl, location.href))
        ).toString();
      }
    }
  });
}

export async function createModelLoader(extraOptions = {}) {
  const runtimeOptions = extraOptions.runtime ?? {};
  if (isWorkerRuntimeEnabled()) {
    const runtimeFactory = extraOptions.runtimeFactory ?? await getWorkerRuntimeFactory();
    return new ThreeMmdLoader({
      ...extraOptions,
      ddsLoader: extraOptions.ddsLoader ?? new DDSLoader(),
      geometryAwareAlpha: extraOptions.geometryAwareAlpha ?? true,
      runtimeFactory,
      runtime: createViewerRuntimeOptions({
        ...runtimeOptions,
        physics: "external"
      })
    });
  }
  const physicsBackend = await createPhysicsBackend();
  try {
    const runtimeFactory = extraOptions.runtimeFactory ?? await createRuntimeFactory(physicsBackend);
    const loader = new ThreeMmdLoader({
      ...extraOptions,
      ddsLoader: extraOptions.ddsLoader ?? new DDSLoader(),
      geometryAwareAlpha: extraOptions.geometryAwareAlpha ?? true,
      runtimeFactory,
      runtime: createViewerRuntimeOptions({
        ...runtimeOptions,
        physics: "external",
        physicsBackend
      })
    });
    state.physicsBackendByLoader.set(loader, physicsBackend);
    return loader;
  } catch (error) {
    releasePhysicsBackend(physicsBackend);
    throw error;
  }
}

async function loadManagedModel(loader, source) {
  const managedPhysicsBackend = state.physicsBackendByLoader.get(loader);
  state.physicsBackendByLoader.delete(loader);
  try {
    const model = await loader.loadModel(source, createViewerModelLoadOptions());
    registerPhysicsBackendForModel(model, managedPhysicsBackend);
    return model;
  } catch (error) {
    releasePhysicsBackend(managedPhysicsBackend);
    throw error;
  }
}

async function createRuntimeFactory(physicsBackend) {
  if (state.activeRuntimeMode === "js") {
    return () => new DefaultMmdRuntime(createViewerRuntimeOptions({
      physics: "external",
      physicsBackend
    }));
  }
  if (state.activeRuntimeMode !== "mmd-anim") {
    return undefined;
  }
  const wasm = await import("/__mmd_anim_wasm/mmd_anim_wasm.js");
  await wasm.default();
  return ({ modelBytes }) => {
    if (!isPmxBytes(modelBytes)) {
      return new DefaultMmdRuntime(createViewerRuntimeOptions({
        physics: "external",
        physicsBackend
      }));
    }
    return MmdAnimRuntime.fromPmxBytes(wasm, modelBytes, createViewerRuntimeOptions({
      physics: "external",
      physicsBackend
    }));
  };
}

function isPmxBytes(bytes) {
  return (
    bytes instanceof Uint8Array &&
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4d &&
    bytes[2] === 0x58 &&
    bytes[3] === 0x20
  );
}
