import { parseVmd } from "../../../dist/parser/index.js";
import { findMmdMotionFiles, normalizeMmdRelativePath } from "../../../dist/three/index.js";

import { dom, setStatus, updateChromeHeights, updatePlaybackDisplay, updateTransportState } from "./dom.js";
import { animationDurationSeconds, state } from "./state.js";
import { renderStillFrame, syncAudioToMotionTime, syncPlaybackToCurrentAudioState } from "./playback.js";

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch " + url + ": " + response.status);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadMotionFromUrl(url) {
  try {
    setStatus(`Loading ${url}`, "loading");
    const bytes = await fetchBytes(url);
    await loadMotion(bytes, url.split("/").at(-1) ?? url);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
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
    if (!state.currentModel) {
      state.pendingMotionSource = source;
      state.pendingMotionLabel = label;
      updateMotionSwitcherSelection(source);
      setStatus("Motion queued", "ready");
      return;
    }
    setStatus(`Loading motion: ${label}`, "loading");
    state.pendingMotionSource = source;
    state.pendingMotionLabel = label;
    const bytes = await readAnimationSourceBytes(source);
    const animation = parseVmd(bytes);
    state.currentMotion = {
      source,
      name: animation.metadata.modelName,
      animation,
      durationSeconds: animationDurationSeconds(animation)
    };
    state.currentModel.runtime?.setAnimation(animation, state.currentModel.mesh);
    dom.timeline.max = String(Math.max(animationDurationSeconds(animation), 0.001));
    state.elapsedSeconds = 0;
    dom.timeline.value = "0";
    syncAudioToMotionTime();
    updateMotionSwitcherSelection(source);
    updatePlaybackDisplay();
    updateTransportState();
    syncPlaybackToCurrentAudioState();
    setStatus("", "ready");
    renderStillFrame();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
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
    state.currentModel.runtime?.setAnimation(poseAnimation.animation, state.currentModel.mesh);
    state.elapsedSeconds = 0;
    dom.timeline.max = "1";
    dom.timeline.value = "0";
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

export function motionFileKey(file) {
  return normalizeMmdRelativePath(file.webkitRelativePath || file.name);
}

export async function switchMotion(file) {
  setStatus(`Switching motion to ${file.name}`, "loading");
  await loadMotion(file);
}

export function updateMotionSwitcher(selectedFile) {
  if (!(dom.motionSwitcher instanceof window.HTMLSelectElement)) {
    return;
  }

  dom.motionSwitcher.replaceChildren(
    ...state.currentMotionVmdFiles.map((file) => {
      const option = document.createElement("option");
      option.value = file.name;
      option.textContent = file.name;
      return option;
    })
  );
  dom.motionSwitcher.value = selectedFile?.name ?? "";
  dom.motionSwitcher.hidden = state.currentMotionVmdFiles.length === 0;
  updateChromeHeights();
}

export function updateMotionSwitcherSelection(source) {
  if (!(source instanceof window.File)) {
    return;
  }
  const selectedFile = state.currentMotionVmdFiles.find(
    (file) => file === source || file.name === source.name
  );
  if (selectedFile) {
    updateMotionSwitcher(selectedFile);
  }
}

export function resetMotionSwitcherState() {
  state.currentMotionVmdFiles = [];
  if (dom.motionSwitcher instanceof window.HTMLSelectElement) {
    dom.motionSwitcher.replaceChildren();
    dom.motionSwitcher.hidden = true;
  }
  updateChromeHeights();
}
