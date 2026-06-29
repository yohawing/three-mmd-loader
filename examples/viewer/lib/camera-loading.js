import { sampleMmdCameraTrackInto } from "../../../dist/runtime/index.js";
import { applyMmdCameraStateToThreeCamera } from "../../../dist/three/index.js";

import { dom, setLoadedFileSwitcherOptions, setStatus, updatePlaybackDisplay, updateTransportState } from "./dom.js";
import { currentMmdFrame, currentMotionDurationSeconds, hasCurrentMotion } from "./state.js";
import { state } from "./state.js";
import { labelFromUrl } from "./url-label.js";

export async function loadCameraFromUrl(url) {
  try {
    const label = labelFromUrl(url);
    setStatus(`Loading camera: ${label}`, "loading");
    const { animation } = await state.animationLoader.loadAnimation(url);
    return await loadCameraAnimation(animation, label, createCameraSwitcherEntry(url, label));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    return false;
  }
}

export async function loadCameraFile(file) {
  try {
    setStatus(`Loading camera: ${file.name}`, "loading");
    const { animation } = await state.animationLoader.loadAnimation(file);
    return await loadCameraAnimation(animation, file.name, createCameraSwitcherEntry(file, file.name));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    return false;
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
  const sampled = cameraMotion && cameraMotion.frames.length > 0
    ? sampleMmdCameraTrackInto(
        cameraMotion.frames,
        currentMmdFrame(),
        state.cameraStateScratch,
        cameraMotion.frameIndexHint
      )
    : state.currentModel?.runtime?.cameraState?.();
  if (!sampled) {
    return;
  }
  const activeCamera = applyMmdCameraStateToThreeCamera(
    state.perspectiveCamera,
    sampled,
    state.cameraApplyOptions
  );
  state.controls.target.copy(state.cameraTargetScratch);
  if (state.camera !== activeCamera) {
    state.camera = activeCamera;
    state.controls.object = activeCamera;
  }
}

export async function loadCameraAnimation(animation, label, entry) {
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
      dom.timeline.value = 0;
    }
    updatePlaybackDisplay();
  }
  updateTransportState();
  applyCameraMotion();
  setStatus("", "ready");
  state.renderer.render(state.scene, state.camera);
  return true;
}

export function createCameraSwitcherEntry(source, label) {
  if (source instanceof window.File) {
    return {
      id: `file:${source.name}:${source.lastModified}`,
      name: label,
      source
    };
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

function syncTimelineRangeToCurrentMotion() {
  if (!dom.timeline) {
    return;
  }
  const maxTime = Math.max(currentMotionDurationSeconds(), 0.001);
  dom.timeline.max = maxTime;
  if (state.elapsedSeconds > maxTime) {
    state.elapsedSeconds = Math.max(maxTime - 0.001, 0);
    dom.timeline.value = state.elapsedSeconds;
  }
  updatePlaybackDisplay();
}

function updateCameraSwitcher(selectedEntry) {
  if (selectedEntry) {
    state.currentCameraEntries = [selectedEntry];
  }
  setLoadedFileSwitcherOptions(
    dom.cameraSwitcher,
    state.currentCameraEntries.map((entry) => ({
      value: entry.id,
      label: entry.name
    })),
    selectedEntry?.id
  );
  if (dom.cameraControl) {
    dom.cameraControl.hidden = state.currentCameraEntries.length === 0;
  }
}
