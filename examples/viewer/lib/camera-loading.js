import { parseVmd } from "../../../dist/parser/index.js";
import { sampleMmdCameraTrackInto } from "../../../dist/runtime/index.js";
import { applyMmdCameraStateToThreeCamera } from "../../../dist/three/index.js";

import { dom, setStatus, updatePlaybackDisplay, updateTransportState } from "./dom.js";
import { currentMmdFrame, currentMotionDurationSeconds, hasCurrentMotion } from "./state.js";
import { state } from "./state.js";
import { labelFromUrl } from "./url-label.js";

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch " + url + ": " + response.status);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadCameraFromUrl(url) {
  try {
    setStatus(`Loading camera: ${labelFromUrl(url)}`, "loading");
    const animation = parseVmd(await fetchBytes(url));
    return await loadCameraAnimation(animation, labelFromUrl(url), {
      id: `url:${url}`,
      name: labelFromUrl(url),
      source: url
    });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    return false;
  }
}

export async function loadCameraFile(file) {
  try {
    setStatus(`Loading camera: ${file.name}`, "loading");
    const animation = parseVmd(new Uint8Array(await file.arrayBuffer()));
    await loadCameraAnimation(animation, file.name, {
      id: `file:${file.name}:${file.lastModified}`,
      name: file.name,
      source: file
    });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

export async function switchCameraEntry(entry) {
  if (!entry) {
    return;
  }
  if (typeof entry.source === "string") {
    await loadCameraFromUrl(entry.source);
    return;
  }
  await loadCameraFile(entry.source);
}

export function clearCameraMotion() {
  state.currentCameraMotion = undefined;
  state.currentCameraEntries = [];
  state.camera = state.perspectiveCamera;
  state.controls.object = state.camera;
  updateCameraSwitcher();
  syncTimelineRangeToCurrentMotion();
  updateTransportState();
}

export function applyCameraMotion() {
  const cameraMotion = state.currentCameraMotion;
  if (!cameraMotion || cameraMotion.frames.length === 0) {
    return;
  }
  const frameNumber = currentMmdFrame();
  const sampled = sampleMmdCameraTrackInto(
    cameraMotion.frames,
    frameNumber,
    state.cameraStateScratch,
    cameraMotion.frameIndexHint
  );
  if (!sampled) {
    return;
  }
  const activeCamera = applyMmdCameraStateToThreeCamera(
    state.perspectiveCamera,
    sampled,
    state.cameraApplyOptions
  );
  if (state.camera !== activeCamera) {
    state.camera = activeCamera;
    state.controls.object = activeCamera;
  }
}

async function loadCameraAnimation(animation, label, entry) {
  if (animation.cameraFrames.length === 0) {
    setStatus("Selected VMD has no camera frames.", "error");
    return false;
  }
  state.currentCameraMotion = {
    name: label,
    frames: animation.cameraFrames,
    durationSeconds: Math.max((animation.metadata?.maxFrame ?? 0) / state.mmdFrameRate, 0),
    frameIndexHint: { index: 0 }
  };
  updateCameraSwitcher({
    ...entry,
    name: label
  });
  if (dom.timeline) {
    syncTimelineRangeToCurrentMotion();
    if (!hasCurrentMotion()) {
      state.elapsedSeconds = 0;
      dom.timeline.value = "0";
    }
    updatePlaybackDisplay();
  }
  updateTransportState();
  applyCameraMotion();
  setStatus("", "ready");
  state.controls.update();
  state.renderer.render(state.scene, state.camera);
  return true;
}

function syncTimelineRangeToCurrentMotion() {
  if (!dom.timeline) {
    return;
  }
  const maxTime = Math.max(currentMotionDurationSeconds(), 0.001);
  dom.timeline.max = String(maxTime);
  if (state.elapsedSeconds > maxTime) {
    state.elapsedSeconds = Math.max(maxTime - 0.001, 0);
    dom.timeline.value = String(state.elapsedSeconds);
  }
  updatePlaybackDisplay();
}

function updateCameraSwitcher(selectedEntry) {
  if (!(dom.cameraSwitcher instanceof window.HTMLSelectElement)) {
    return;
  }
  if (selectedEntry) {
    state.currentCameraEntries = [selectedEntry];
  }
  dom.cameraSwitcher.replaceChildren(
    ...state.currentCameraEntries.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      return option;
    })
  );
  if (selectedEntry) {
    dom.cameraSwitcher.value = selectedEntry.id;
  }
  if (dom.cameraControl) {
    dom.cameraControl.hidden = state.currentCameraEntries.length === 0;
  }
}
