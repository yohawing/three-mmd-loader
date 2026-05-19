import {
  ThreeMmdLoader,
  createMmdTextureMapFromFiles,
  findMmdModelFiles,
  normalizeMmdRelativePath,
  syncMmdSpecularDirection
} from "../../../dist/three/index.js";

import { createPhysicsBackend, disposeActivePhysicsBackend } from "./ammo-bootstrap.js";
import { loadAudioFile, isAudioFile } from "./audio-loading.js";
import { restoreDebugMaterials } from "./debug.js";
import { reportTextureDiagnostics } from "./diagnostics.js";
import { dom, setStatus, updateChromeHeights, updatePlaybackDisplay, updateStageState, updateTransportState } from "./dom.js";
import { disposeModelResources } from "./dispose.js";
import { loadMotion, loadPose, findVmdFiles, updateMotionSwitcher, resetMotionSwitcherState } from "./motion-loading.js";
import { renderStillFrame, syncAudioToMotionTime, syncPlaybackToCurrentAudioState } from "./playback.js";
import { currentMotionDurationSeconds, hasCurrentMotion, state } from "./state.js";
import { fitCameraToObject } from "./scene-setup.js";

export async function loadModelFromUrl(url) {
  try {
    setStatus(`Loading ${url}`, "loading");
    const bytes = await fetchBytes(url);
    await loadModel(bytes, url.split("/").at(-1) ?? url, () => createUrlTextureLoader(url));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadModel(source, label = source.name ?? "model", modelLoader) {
  try {
    setStatus(`Loading model: ${label}`, "loading");
    resetFolderModelState();
    const preservedMotion = state.currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true
    });
    const resolvedModelLoader =
      typeof modelLoader === "function"
        ? await modelLoader()
        : await (modelLoader ?? createModelLoader());
    state.currentModel = await resolvedModelLoader.loadModel(source, { frustumCulled: false });
    syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
    addModelToScene(state.currentModel);
    state.currentFolderPmxFiles = [createModelSwitcherEntry(source, label)];
    updateModelSwitcher(state.currentFolderPmxFiles[0]);
    state.elapsedSeconds = 0;
    dom.timeline.max = "0.001";
    dom.timeline.value = "0";
    updatePlaybackDisplay();
    fitCameraToObject(state.currentModel.mesh);
    if (state.pendingMotionSource && !preservedMotion) {
      await loadMotion(state.pendingMotionSource, state.pendingMotionLabel);
    } else if (hasCurrentMotion()) {
      state.currentModel.runtime?.setAnimation(state.currentMotion.animation, state.currentModel.mesh);
      dom.timeline.max = String(Math.max(currentMotionDurationSeconds(), 0.001));
      syncAudioToMotionTime();
      updateTransportState();
      syncPlaybackToCurrentAudioState();
    } else {
      state.currentModel.runtime?.setAnimation(state.restPoseAnimation, state.currentModel.mesh);
    }
    setStatus("", "ready");
    reportTextureDiagnostics(state.currentModel);
    updateStageState();
    renderStillFrame();
  } catch (error) {
    resetFolderModelState();
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
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
  state.currentFolderTextureMap = textureMap;
  state.currentFolderPmxFiles = modelFiles;
  updateModelSwitcher(modelFile);

  try {
    setStatus(`Loading model folder: ${folderName}`, "loading");
    const preservedMotion = state.currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true
    });
    const folderLoader = await createModelLoader({ textureMap });
    state.currentModel = await folderLoader.loadModel(modelFile, { frustumCulled: false });
    syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
    addModelToScene(state.currentModel);
    state.elapsedSeconds = 0;
    dom.timeline.max = "0.001";
    dom.timeline.value = "0";
    updatePlaybackDisplay();
    fitCameraToObject(state.currentModel.mesh);
    if (state.pendingMotionSource && !preservedMotion) {
      await loadMotion(state.pendingMotionSource, state.pendingMotionLabel);
    } else if (hasCurrentMotion()) {
      state.currentModel.runtime?.setAnimation(state.currentMotion.animation, state.currentModel.mesh);
      dom.timeline.max = String(Math.max(currentMotionDurationSeconds(), 0.001));
      syncAudioToMotionTime();
      updateTransportState();
      syncPlaybackToCurrentAudioState();
    } else {
      state.currentModel.runtime?.setAnimation(state.restPoseAnimation, state.currentModel.mesh);
    }
    setStatus("", "ready");
    reportTextureDiagnostics(state.currentModel);
    updateStageState();
    renderStillFrame();
  } catch (error) {
    resetFolderModelState();
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
  }
}

export async function switchFolderModel(modelFile) {
  if (!state.currentFolderTextureMap) {
    return;
  }

  try {
    setStatus(`Switching to ${modelFile.name}`, "loading");
    const preservedMotion = state.currentMotion;
    clearModel({
      preserveMotion: Boolean(preservedMotion),
      preserveModelSwitcher: true
    });
    const folderLoader = await createModelLoader({ textureMap: state.currentFolderTextureMap });
    state.currentModel = await folderLoader.loadModel(modelFile, { frustumCulled: false });
    syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
    addModelToScene(state.currentModel);
    updateModelSwitcher(modelFile);
    state.elapsedSeconds = 0;
    dom.timeline.max = "0.001";
    dom.timeline.value = "0";
    updatePlaybackDisplay();
    fitCameraToObject(state.currentModel.mesh);
    if (hasCurrentMotion()) {
      state.currentModel.runtime?.setAnimation(state.currentMotion.animation, state.currentModel.mesh);
      dom.timeline.max = String(Math.max(currentMotionDurationSeconds(), 0.001));
      syncAudioToMotionTime();
      updateTransportState();
      syncPlaybackToCurrentAudioState();
    } else {
      state.currentModel.runtime?.setAnimation(state.restPoseAnimation, state.currentModel.mesh);
    }
    setStatus("", "ready");
    reportTextureDiagnostics(state.currentModel);
    updateStageState();
    renderStillFrame();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    updateStageState();
  }
}

export function clearModel(options = {}) {
  restoreDebugMaterials();
  if (state.currentModel) {
    state.scene.remove(state.currentModel.mesh);
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
    dom.timeline.max = "0.001";
    dom.timeline.value = "0";
  }
  updatePlaybackDisplay();
  updateStageState();
  updateTransportState();
}

function addModelToScene(model) {
  state.scene.add(
    model.mesh,
    ...(model.outlineMeshes ?? []),
    ...(model.renderOrderMeshes ?? [])
  );
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
  dom.modelSwitcher.hidden = state.currentFolderPmxFiles.length === 0;
  updateChromeHeights();
}

export function resetFolderModelState() {
  state.currentFolderTextureMap = undefined;
  state.currentFolderPmxFiles = [];
  if (dom.modelSwitcher instanceof window.HTMLSelectElement) {
    dom.modelSwitcher.replaceChildren();
    dom.modelSwitcher.hidden = true;
  }
  updateChromeHeights();
}

export const createFolderTextureMap = createMmdTextureMapFromFiles;

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
    geometryAwareAlpha: extraOptions.geometryAwareAlpha ?? true,
    runtime: {
      ...runtimeOptions,
      frameRate: 30,
      physics: "external",
      physicsBackend
    }
  });
}
