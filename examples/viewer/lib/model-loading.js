import {
  ThreeMmdLoader,
  createMmdTextureMapFromFiles,
  findMmdModelFiles,
  normalizeMmdRelativePath,
  syncMmdSpecularDirection
} from "../../../dist/three/index.js";
import { DDSLoader } from "three/addons/loaders/DDSLoader.js";

import { createPhysicsBackend, disposeActivePhysicsBackend } from "./ammo-bootstrap.js";
import { loadAudioFile, isAudioFile } from "./audio-loading.js";
import { hideColliderHelpers, refreshDebugPanelState, restoreDebugMaterials, setOutlineHidden, showColliderHelpers } from "./debug.js";
import { reportTextureDiagnostics } from "./diagnostics.js";
import { dom, setStatus, updateChromeHeights, updatePlaybackDisplay, updateStageState, updateTransportState } from "./dom.js";
import { disposeModelResources } from "./dispose.js";
import { loadMotion, loadPose, findVmdFiles, updateMotionSwitcher, resetMotionSwitcherState } from "./motion-loading.js";
import { renderStillFrame, syncAudioToMotionTime, syncPlaybackToCurrentAudioState } from "./playback.js";
import { createViewerLoadProfile, describeViewerSource } from "./performance.js";
import { currentMotionDurationSeconds, hasCurrentMotion, state } from "./state.js";
import { fitCameraToObject } from "./scene-setup.js";
import { labelFromUrl } from "./url-label.js";

export async function loadModelFromUrl(url) {
  const profile = createViewerLoadProfile(`url:${url}`);
  profile?.mark("start");
  const label = labelFromUrl(url);
  try {
    setStatus(`Loading ${url}`, "loading");
    const bytes = await fetchBytes(url);
    profile?.mark("bytes");
    return await loadModel(bytes, label, () => createUrlTextureLoader(url), profile, {
      id: `url:${url}`,
      name: label,
      source: url
    });
  } catch (error) {
    profile?.mark("error");
    profile?.measure("source-bytes", "start", "bytes");
    profile?.measure("failed-total", "start", "error");
    profile?.report();
    setStatus(error instanceof Error ? error.message : String(error), "error");
    return false;
  }
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadModel(source, label = source.name ?? "model", modelLoader, profile, switcherEntry) {
  const loadProfile = profile ?? createViewerLoadProfile(describeViewerSource(source, label));
  if (!profile) {
    loadProfile?.mark("start");
  }
  loadProfile?.mark("load-start");
  try {
    setStatus(`Loading model: ${label}`, "loading");
    resetFolderModelState();
    const preservedMotion = state.currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true
    });
    loadProfile?.mark("cleared");
    const resolvedModelLoader =
      typeof modelLoader === "function"
        ? await modelLoader()
        : await (modelLoader ?? createModelLoader());
    loadProfile?.mark("loader-ready");
    state.currentModel = await resolvedModelLoader.loadModel(source, { frustumCulled: false });
    loadProfile?.mark("model-loaded");
    syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
    addModelToScene(state.currentModel);
    loadProfile?.mark("scene-ready");
    state.currentFolderPmxFiles = [switcherEntry ?? createModelSwitcherEntry(source, label)];
    updateModelSwitcher(state.currentFolderPmxFiles[0]);
    state.elapsedSeconds = 0;
    dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
    dom.timeline.value = 0;
    updatePlaybackDisplay();
    fitCameraToObject(state.currentModel.mesh);
    if (state.pendingMotionSource && !preservedMotion) {
      await loadMotion(state.pendingMotionSource, state.pendingMotionLabel);
    } else if (hasCurrentMotion()) {
      state.currentModel.setAnimation(state.currentMotion);
      dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
      syncAudioToMotionTime();
      updateTransportState();
      syncPlaybackToCurrentAudioState();
    } else {
      state.currentModel.setAnimation(state.restPoseAnimation);
    }
    loadProfile?.mark("animation-ready");
    setStatus("", "ready");
    reportTextureDiagnostics(state.currentModel);
    updateStageState();
    if (state.debugOutlineHidden) {
      setOutlineHidden(true);
    }
    if (state.showDebugColliders) {
      showColliderHelpers();
    }
    renderStillFrame();
    refreshDebugPanelState();
    loadProfile?.mark("first-render");
    return true;
  } catch (error) {
    loadProfile?.mark("error");
    resetFolderModelState();
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
    return false;
  } finally {
    measureModelLoadProfile(loadProfile);
  }
}

export async function loadModelFolder(files) {
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
  state.currentFolderPmxFiles = modelFiles;
  updateModelSwitcher(modelFile);

  try {
    profile?.mark("load-start");
    setStatus(`Loading model folder: ${folderName}`, "loading");
    const preservedMotion = state.currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true
    });
    profile?.mark("cleared");
    const folderLoader = await createModelLoader({ textureMap });
    profile?.mark("loader-ready");
    state.currentModel = await folderLoader.loadModel(modelFile, { frustumCulled: false });
    profile?.mark("model-loaded");
    syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
    addModelToScene(state.currentModel);
    profile?.mark("scene-ready");
    state.elapsedSeconds = 0;
    dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
    dom.timeline.value = 0;
    updatePlaybackDisplay();
    fitCameraToObject(state.currentModel.mesh);
    if (state.pendingMotionSource && !preservedMotion) {
      await loadMotion(state.pendingMotionSource, state.pendingMotionLabel);
    } else if (hasCurrentMotion()) {
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
    updateStageState();
    if (state.debugOutlineHidden) {
      setOutlineHidden(true);
    }
    if (state.showDebugColliders) {
      showColliderHelpers();
    }
    renderStillFrame();
    refreshDebugPanelState();
    profile?.mark("first-render");
  } catch (error) {
    profile?.mark("error");
    resetFolderModelState();
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
  } finally {
    measureModelLoadProfile(profile);
  }
}

export async function switchFolderModel(modelFile) {
  if (!state.currentFolderTextureMap) {
    return;
  }

  const profile = createViewerLoadProfile(`switch:${modelFile.name}`);
  profile?.mark("start");
  profile?.mark("load-start");
  try {
    setStatus(`Switching to ${modelFile.name}`, "loading");
    const preservedMotion = state.currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true
    });
    profile?.mark("cleared");
    const folderLoader = await createModelLoader({ textureMap: state.currentFolderTextureMap });
    profile?.mark("loader-ready");
    state.currentModel = await folderLoader.loadModel(modelFile, { frustumCulled: false });
    profile?.mark("model-loaded");
    syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
    addModelToScene(state.currentModel);
    updateModelSwitcher(modelFile);
    profile?.mark("scene-ready");
    state.elapsedSeconds = 0;
    dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001);
    dom.timeline.value = 0;
    updatePlaybackDisplay();
    fitCameraToObject(state.currentModel.mesh);
    if (hasCurrentMotion()) {
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
    updateStageState();
    if (state.debugOutlineHidden) {
      setOutlineHidden(true);
    }
    if (state.showDebugColliders) {
      showColliderHelpers();
    }
    renderStillFrame();
    refreshDebugPanelState();
    profile?.mark("first-render");
  } catch (error) {
    profile?.mark("error");
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
  } finally {
    measureModelLoadProfile(profile);
  }
}

export function clearModel(options = {}) {
  hideColliderHelpers();
  restoreDebugMaterials();
  if (state.currentModel) {
    state.scene.remove(state.currentModel.root);
    disposeModelResources(state.currentModel);
  }
  state.currentModel = undefined;
  disposeActivePhysicsBackend();
  if (!options.preserveMotion) {
    state.currentMotion = undefined;
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

function addModelToScene(model) {
  state.scene.add(model.root);
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
  const shouldLoadModelFolder =
    modelFile && files.some((file) => file.webkitRelativePath?.includes("/"));
  if (vmdFiles.length > 0) {
    state.currentMotionVmdFiles = vmdFiles;
    updateMotionSwitcher(vmdFiles[0]);
    state.pendingMotionSource = undefined;
    state.pendingMotionLabel = undefined;
  } else {
    resetMotionSwitcherState();
  }
  if (shouldLoadModelFolder) {
    await loadModelFolder(files);
  } else if (modelFile) {
    await loadModel(modelFile);
  }
  if (vmdFiles.length > 0) {
    state.currentMotionVmdFiles = vmdFiles;
    updateMotionSwitcher(vmdFiles[0]);
    await loadMotion(vmdFiles[0]);
  }
  for (const file of files) {
    if (file === modelFile || vmdFiles.includes(file)) {
      continue;
    }
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".pmx") || lowerName.endsWith(".pmd")) {
      if (!shouldLoadModelFolder) {
        await loadModel(file);
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
  if (!(dom.modelSwitcher instanceof window.HTMLSelectElement)) {
    return;
  }

  dom.modelSwitcher.replaceChildren(
    ...state.currentFolderPmxFiles.map((file) => {
      const option = document.createElement("option");
      option.value = modelFileKey(file);
      option.textContent = file.name;
      return option;
    })
  );
  dom.modelSwitcher.value = modelFileKey(selectedFile);
  dom.modelSwitcher.hidden = false;
  if (dom.modelControl) {
    dom.modelControl.hidden = state.currentFolderPmxFiles.length === 0;
  }
  updateChromeHeights();
}

export function resetFolderModelState() {
  state.currentFolderTextureMap = undefined;
  state.currentFolderPmxFiles = [];
  if (dom.modelSwitcher instanceof window.HTMLSelectElement) {
    dom.modelSwitcher.replaceChildren();
    dom.modelSwitcher.hidden = false;
  }
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
  const physicsBackend = await createPhysicsBackend();
  return new ThreeMmdLoader({
    ...extraOptions,
    ddsLoader: extraOptions.ddsLoader ?? new DDSLoader(),
    geometryAwareAlpha: extraOptions.geometryAwareAlpha ?? true,
    runtime: {
      ...runtimeOptions,
      frameRate: state.mmdFrameRate,
      physics: "external",
      physicsBackend
    }
  });
}
