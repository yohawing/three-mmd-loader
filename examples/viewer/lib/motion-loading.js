import { parseVmdSectionInventory } from "../../../dist/parser/index.js";
import { findMmdMotionFiles, normalizeMmdRelativePath } from "../../../dist/three/index.js";

import { clearLoadedFileSwitcher, dom, setLoadedFileSwitcherOptions, setStatus, updateChromeHeights, updatePlaybackDisplay, updateTransportState } from "./dom.js";
import { animationDurationSeconds, kurokoModelUrl, state } from "./state.js";
import { createCameraSwitcherEntry, loadCameraAnimation } from "./camera-loading.js";
import { renderStillFrame, syncAudioToMotionTime, syncPlaybackToCurrentAudioState } from "./playback.js";
import { labelFromUrl } from "./url-label.js";

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch " + url + ": " + response.status);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadMotionFromUrl(url) {
  try {
    setStatus(`Loading ${url}`, "loading");
    return await loadMotion(url, labelFromUrl(url));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    return false;
  }
}

async function readAnimationSourceBytes(source) {
  if (source instanceof Uint8Array) {
    return source;
  }
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  if (typeof source === "string") {
    return fetchBytes(source);
  }
  if (source && typeof source.arrayBuffer === "function") {
    return new Uint8Array(await source.arrayBuffer());
  }
  throw new TypeError("Animation source must be a string, File, ArrayBuffer, or Uint8Array");
}

export async function loadMotion(source, label = source.name ?? "motion") {
  try {
    const switcherEntry = createMotionSwitcherEntry(source, label);
    setStatus(`Loading motion: ${label}`, "loading");
    const loaded = await state.animationLoader.loadAnimation(source);
    const { animation } = loaded;
    if (isCameraOnlyVmdAnimation(animation)) {
      state.pendingMotionSource = undefined;
      state.pendingMotionLabel = undefined;
      return await loadCameraAnimation(loaded, label, createCameraSwitcherEntry(source, label));
    }
    if (!state.currentModel) {
      state.pendingMotionSource = source;
      state.pendingMotionLabel = label;
      updateMotionSwitcherSelection(switcherEntry);
      setStatus("Motion queued", "ready");
      void loadKurokoModelForQueuedMotion();
      return true;
    }
    state.pendingMotionSource = source;
    state.pendingMotionLabel = label;
    state.currentMotion = {
      source,
      name: animation.metadata.modelName,
      animation,
      durationSeconds: animationDurationSeconds(animation)
    };
    state.currentModel.setAnimation(animation);
    dom.timeline.max = Math.max(animationDurationSeconds(animation), state.currentCameraMotion?.durationSeconds ?? 0, 0.001);
    state.elapsedSeconds = 0;
    dom.timeline.value = 0;
    syncAudioToMotionTime();
    updateMotionSwitcherSelection(switcherEntry);
    updatePlaybackDisplay();
    updateTransportState();
    syncPlaybackToCurrentAudioState();
    setStatus("", "ready");
    renderStillFrame();
    return true;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    return false;
  }
}

export async function loadPose(source, label = source.name ?? "pose") {
  try {
    if (!state.currentModel) {
      setStatus("Load a model before loading a pose.", "error");
      return;
    }
    setStatus(`Loading pose: ${label}`, "loading");
    const poseAnimation = await state.animationLoader.loadPoseAnimation(source, label);
    state.currentMotion = {
      ...poseAnimation,
      durationSeconds: 1
    };
    state.currentModel.setAnimation(poseAnimation);
    state.elapsedSeconds = 0;
    dom.timeline.max = 1;
    dom.timeline.value = 0;
    resetMotionSwitcherState();
    updatePlaybackDisplay();
    updateTransportState();
    setStatus("", "ready");
    renderStillFrame();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

export const findVmdFiles = findMmdMotionFiles;

export async function classifyVmdFiles(files) {
  const motionFiles = [];
  const cameraFiles = [];
  for (const file of files) {
    if (await isCameraOnlyVmdSource(file)) {
      cameraFiles.push(file);
    } else {
      motionFiles.push(file);
    }
  }
  return { motionFiles, cameraFiles };
}

export function motionFileKey(file) {
  if (typeof file.id === "string") {
    return file.id;
  }
  if (typeof file.source === "string") {
    return `url:${file.source}`;
  }
  return normalizeMmdRelativePath(file.webkitRelativePath || file.name);
}

export async function switchMotion(file) {
  setStatus(`Switching motion to ${file.name}`, "loading");
  await loadMotion(file.source ?? file, file.name);
}

export function clearMotion() {
  state.currentMotion = undefined;
  state.pendingMotionSource = undefined;
  state.pendingMotionLabel = undefined;
  if (state.currentModel) {
    state.currentModel.setAnimation(state.restPoseAnimation);
  }
  if (dom.timeline) {
    dom.timeline.max = Math.max(state.currentCameraMotion?.durationSeconds ?? 0, 0.001);
    dom.timeline.value = 0;
  }
  state.elapsedSeconds = 0;
  resetMotionSwitcherState();
  updatePlaybackDisplay();
  updateTransportState();
  setStatus("", "ready");
  renderStillFrame();
}

export function updateMotionSwitcher(selectedFile) {
  setLoadedFileSwitcherOptions(
    dom.motionSwitcher,
    state.currentMotionVmdFiles.map((file) => ({
      value: motionFileKey(file),
      label: file.name
    })),
    selectedFile ? motionFileKey(selectedFile) : ""
  );
  if (dom.motionControl) {
    dom.motionControl.hidden = state.currentMotionVmdFiles.length === 0;
  }
  updateChromeHeights();
}

export function updateMotionSwitcherSelection(entry) {
  if (!entry) {
    return;
  }
  const selectedFile = state.currentMotionVmdFiles.find(
    (file) => file === entry || motionFileKey(file) === motionFileKey(entry)
  );
  if (selectedFile) {
    updateMotionSwitcher(selectedFile);
    return;
  }
  state.currentMotionVmdFiles = [entry];
  updateMotionSwitcher(entry);
}

function createMotionSwitcherEntry(source, label) {
  if (source instanceof window.File) {
    return source;
  }
  if (typeof source === "string") {
    return {
      id: `url:${source}`,
      name: label,
      source
    };
  }
  return undefined;
}

async function loadKurokoModelForQueuedMotion() {
  if (state.kurokoModelLoadPromise) {
    await state.kurokoModelLoadPromise;
    return;
  }
  state.kurokoModelLoadPromise = import("./model-loading.js")
    .then(({ loadModelFromUrl }) => loadModelFromUrl(kurokoModelUrl, {
      shouldCommit: hasQueuedMotionWithoutModel
    }))
    .finally(() => {
      state.kurokoModelLoadPromise = undefined;
      if (!state.currentModel && state.pendingMotionSource) {
        setStatus("Motion queued", "ready");
      }
    });
  await state.kurokoModelLoadPromise;
}

function hasQueuedMotionWithoutModel() {
  return !state.currentModel && state.pendingMotionSource !== undefined;
}

function isCameraOnlyVmdAnimation(animation) {
  return isCameraOnlyVmdCounts(animation.metadata?.counts);
}

async function isCameraOnlyVmdSource(source) {
  try {
    const inventory = parseVmdSectionInventory(await readAnimationSourceBytes(source));
    return isCameraOnlyVmdCounts(inventory.counts);
  } catch {
    return false;
  }
}

function isCameraOnlyVmdCounts(counts) {
  return Boolean(counts && counts.cameras > 0 && counts.bones === 0 && counts.morphs === 0);
}

export function resetMotionSwitcherState() {
  state.currentMotionVmdFiles = [];
  clearLoadedFileSwitcher(dom.motionSwitcher);
  if (dom.motionControl) {
    dom.motionControl.hidden = true;
  }
  updateChromeHeights();
}
