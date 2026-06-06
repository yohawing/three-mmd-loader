import { clearAudioSource, isAudioElement, loadAudioFile, setAudioOffsetFrame, switchAudioEntry } from "./lib/audio-loading.js";
import { bindAssetLibraryControls, initializeAssetLibrary } from "./lib/asset-library.js";
import { clearBackground, loadBackgroundFolder, loadBackgroundFromUrl, switchBackgroundEntry } from "./lib/background-loading.js";
import { clearCameraMotion, loadCameraFile, loadCameraFromUrl, switchCameraEntry } from "./lib/camera-loading.js";
import { bindCreditPopupControls } from "./lib/credits.js";
import { createViewerDebugApi, refreshDebugPanelState, setDebugMaterialMode, setOutlineHidden, setSelfShadowEnabled, toggleColliderHelpers } from "./lib/debug.js";
import { dom, loadedFileSwitcherValue, setStatus, toggleLoadMenu, updateChromeHeights, updatePlaybackDisplay, updatePlayToggle, updateStageState } from "./lib/dom.js";
import { getLocale, resolveInitialLocale, setLocale } from "./lib/i18n.js";
import { disposeActivePhysicsBackend } from "./lib/physics-backend.js";
import { loadModelFolder, loadModelFromUrl, modelFileKey, bindDropTarget, clearModel, resetFolderModelState, switchFolderModel } from "./lib/model-loading.js";
import { clearMotion, loadMotion, loadMotionFromUrl, loadPose, classifyVmdFiles, motionFileKey, resetMotionSwitcherState, switchMotion, updateMotionSwitcher } from "./lib/motion-loading.js";
import { evaluateRuntime, finishAudioTimeSync, render, renderStillFrame, setPlaybackPlaying, setPlaybackState, syncAudioToMotionTime, syncMotionToAudioTime } from "./lib/playback.js";
import { resize, setViewportAxesVisible, setViewportGridVisible, setupScene } from "./lib/scene-setup.js";
import { currentMotionDurationSeconds, debugEnabled, hasCurrentMotion, state } from "./lib/state.js";

const volumeStorageKey = "three-mmd-loader.viewer.volume.v1";
let frameCurrentInputDirty = false;

setupScene();
initLocalization();
initVolumeControls();

const viewerApi = {
  get camera() { return state.camera; },
  get controls() { return state.controls; },
  get renderer() { return state.renderer; },
  get scene() { return state.scene; },
  loadModelUrl: loadModelFromUrl,
  loadMotionUrl: loadMotionFromUrl,
  loadBackgroundUrl: loadBackgroundFromUrl,
  loadCameraUrl: loadCameraFromUrl,
  get currentModel() { return state.currentModel; },
  get currentMotion() { return state.currentMotion; },
  get currentBackground() { return state.currentBackground; },
  get currentCameraMotion() { return state.currentCameraMotion; }
};
if (debugEnabled) {
  viewerApi.debug = createViewerDebugApi();
  window.mmdDebug = viewerApi.debug;
}
window.mmdViewer = viewerApi;

bindControls();
void initializeAssetLibrary();
resize();
state.frameTimer.update();
state.renderer.setAnimationLoop(render);

function bindControls() {
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", disposeViewerResources, { once: true });
  window.addEventListener("beforeunload", disposeViewerResources, { once: true });
  dom.loadMenu?.querySelector("summary")?.addEventListener("click", toggleLoadMenu);
  dom.languageSelect?.addEventListener("sl-change", () => {
    if (!dom.languageSelect) return;
    setLocale(dom.languageSelect.value);
    updateChromeHeights();
  });
  document.querySelector("#choose-model-folder")?.addEventListener("click", () => dom.modelFolderInput?.click());
  document.querySelector("#choose-motion")?.addEventListener("click", () => dom.motionFileInput?.click());
  document.querySelector("#choose-pose")?.addEventListener("click", () => dom.poseFileInput?.click());
  document.querySelector("#choose-audio")?.addEventListener("click", () => dom.audioFileInput?.click());
  document.querySelector("#choose-background")?.addEventListener("click", () => dom.backgroundFolderInput?.click());
  document.querySelector("#choose-camera")?.addEventListener("click", () => dom.cameraFileInput?.click());
  bindAssetLibraryControls();
  bindCreditPopupControls();
  bindViewportControls();
  bindDebugControls();
  dom.modelFolderInput?.addEventListener("change", (event) => {
    const files = event.target instanceof HTMLInputElement ? event.target.files : undefined;
    if (files && files.length > 0) void loadModelFolder(Array.from(files));
  });
  dom.modelSwitcher?.addEventListener("sl-change", () => {
    const selectedValue = loadedFileSwitcherValue(dom.modelSwitcher);
    const selectedFile = state.currentFolderPmxFiles.find((file) => modelFileKey(file) === selectedValue);
    if (selectedFile) void switchFolderModel(selectedFile);
  });
  dom.modelClearButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    clearModel();
    renderStillFrame();
  });
  dom.motionSwitcher?.addEventListener("sl-change", () => {
    const selectedValue = loadedFileSwitcherValue(dom.motionSwitcher);
    const selectedFile = state.currentMotionVmdFiles.find((file) => motionFileKey(file) === selectedValue);
    if (selectedFile) void switchMotion(selectedFile);
  });
  dom.motionFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) {
      void loadSelectedMotionFile(file);
    }
  });
  dom.poseFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) void loadPose(file);
  });
  dom.audioFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) loadAudioFile(file);
  });
  dom.motionClearButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    clearMotion();
  });
  dom.audioSwitcher?.addEventListener("sl-change", () => {
    const selectedValue = loadedFileSwitcherValue(dom.audioSwitcher);
    const selectedEntry = state.currentAudioEntries.find((entry) => entry.id === selectedValue);
    switchAudioEntry(selectedEntry);
  });
  dom.audioClearButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    clearAudioSource();
  });
  dom.backgroundSwitcher?.addEventListener("sl-change", () => {
    const selectedValue = loadedFileSwitcherValue(dom.backgroundSwitcher);
    const selectedEntry = state.currentBackgroundEntries.find((entry) => entry.id === selectedValue);
    if (selectedEntry) void switchBackgroundEntry(selectedEntry);
  });
  dom.backgroundClearButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    clearBackground();
    renderStillFrame();
  });
  dom.cameraSwitcher?.addEventListener("sl-change", () => {
    const selectedValue = loadedFileSwitcherValue(dom.cameraSwitcher);
    const selectedEntry = state.currentCameraEntries.find((entry) => entry.id === selectedValue);
    if (selectedEntry) void switchCameraEntry(selectedEntry);
  });
  dom.cameraClearButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    clearCameraMotion();
    renderStillFrame();
  });
  dom.backgroundFolderInput?.addEventListener("change", (event) => {
    const files = event.target instanceof HTMLInputElement ? event.target.files : undefined;
    if (files && files.length > 0) void loadBackgroundFolder(Array.from(files));
  });
  dom.cameraFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) void loadCameraFile(file);
  });
  dom.playToggle?.addEventListener("click", () => {
    void setPlaybackPlaying(!state.isPlaying);
  });
  dom.timeline?.addEventListener("sl-input", () => {
    state.isSeeking = true;
    state.elapsedSeconds = Number(dom.timeline.value);
    state.runtimePhysicsDisabledOptionsScratch.physics = false;
    evaluateRuntime(state.runtimePhysicsDisabledOptionsScratch);
    syncAudioToMotionTime();
    scheduleSeekEnd();
  });
  dom.timeline?.addEventListener("sl-change", endSeek);
  dom.frameCurrentInput?.addEventListener("input", () => {
    frameCurrentInputDirty = true;
  });
  dom.frameCurrentInput?.addEventListener("keydown", handleFrameCurrentKeydown);
  dom.frameCurrentInput?.addEventListener("change", commitFrameCurrentInput);
  dom.frameCurrentInput?.addEventListener("blur", handleFrameCurrentBlur);
  dom.volumeSlider?.addEventListener("sl-input", handleVolumeSliderInput);
  dom.volumeSlider?.addEventListener("sl-change", handleVolumeSliderInput);
  dom.audioOffsetFrameInput?.addEventListener("input", handleAudioOffsetFrameInput);
  dom.audioOffsetFrameInput?.addEventListener("change", commitAudioOffsetFrameInput);
  dom.volumeToggle?.addEventListener("click", () => {
    if (!isAudioElement(dom.bgmAudio)) return;
    dom.bgmAudio.muted = !dom.bgmAudio.muted;
    persistVolume(dom.bgmAudio.volume, dom.bgmAudio.muted);
    updateVolumeIcon();
  });
  if (isAudioElement(dom.bgmAudio)) {
    dom.bgmAudio.addEventListener("play", () => {
      if (!state.isSyncingAudioState && hasTimelineSource()) setPlaybackState(true);
    });
    dom.bgmAudio.addEventListener("pause", () => {
      if (!state.isSyncingAudioState && hasTimelineSource()) setPlaybackState(false);
    });
    dom.bgmAudio.addEventListener("seeking", () => {
      if (state.isSeeking) return;
      syncMotionToAudioTime();
    });
    dom.bgmAudio.addEventListener("seeked", () => {
      if (state.isSeeking) return;
      if (finishAudioTimeSync()) return;
      syncMotionToAudioTime();
    });
    dom.bgmAudio.addEventListener("timeupdate", () => {
      if (!state.isPlaying || state.isSeeking || !hasTimelineSource()) return;
      syncMotionToAudioTime(state.audioNoEvaluateOptionsScratch);
    });
    dom.bgmAudio.addEventListener("ended", () => {
      if (!dom.bgmAudio.loop) setPlaybackState(false);
    });
    dom.bgmAudio.addEventListener("loadedmetadata", () => {
      applyStoredVolume();
      setStatus("", "ready");
    });
    dom.bgmAudio.addEventListener("error", () => {
      const message = "Failed to load audio source.";
      window.console?.warn("[viewer]", message, dom.bgmAudio.error);
      setStatus(message, "error");
    });
  }
  bindDropTarget();
  updatePlayToggle();
  updatePlaybackDisplay();
  updateStageState();
}

async function loadSelectedMotionFile(file) {
  const { motionFiles, cameraFiles } = await classifyVmdFiles([file]);
  if (cameraFiles.length > 0 && motionFiles.length === 0) {
    await loadCameraFile(cameraFiles[0]);
    return;
  }
  state.currentMotionVmdFiles = [file];
  updateMotionSwitcher(file);
  await loadMotion(file);
}

function bindViewportControls() {
  if (dom.viewportGridToggle) {
    dom.viewportGridToggle.checked = state.viewportGridVisible;
    dom.viewportGridToggle.setAttribute("aria-checked", String(state.viewportGridVisible));
    dom.viewportGridToggle.addEventListener("change", () => {
      const visible = setViewportGridVisible(dom.viewportGridToggle.checked);
      dom.viewportGridToggle.setAttribute("aria-checked", String(visible));
    });
  }
  if (dom.viewportAxesToggle) {
    dom.viewportAxesToggle.checked = state.viewportAxesVisible;
    dom.viewportAxesToggle.setAttribute("aria-checked", String(state.viewportAxesVisible));
    dom.viewportAxesToggle.addEventListener("change", () => {
      const visible = setViewportAxesVisible(dom.viewportAxesToggle.checked);
      dom.viewportAxesToggle.setAttribute("aria-checked", String(visible));
    });
  }
}

function bindDebugControls() {
  if (!debugEnabled) {
    return;
  }
  if (dom.debugMenu) {
    dom.debugMenu.hidden = false;
  }
  dom.debugCollidersToggle?.addEventListener("change", () => {
    toggleColliderHelpers();
    refreshDebugPanelState();
  });
  dom.debugNormalsToggle?.addEventListener("change", () => {
    setDebugMaterialMode(dom.debugNormalsToggle.checked ? "normals" : "default");
  });
  dom.debugOutlineOffToggle?.addEventListener("change", () => {
    setOutlineHidden(dom.debugOutlineOffToggle.checked);
  });
  dom.debugSelfShadowToggle?.addEventListener("change", () => {
    setSelfShadowEnabled(dom.debugSelfShadowToggle.checked);
  });
  refreshDebugPanelState();
}

function initLocalization() {
  const versionMeta = document.querySelector('meta[name="mmd-viewer-version"]');
  if (dom.appVersionText && versionMeta instanceof window.HTMLMetaElement) {
    dom.appVersionText.textContent = versionMeta.content;
  }
  setLocale(resolveInitialLocale());
  if (dom.languageSelect) {
    dom.languageSelect.value = getLocale();
  }
}

let seekEndTimer;

function scheduleSeekEnd() {
  window.clearTimeout(seekEndTimer);
  seekEndTimer = window.setTimeout(endSeek, 200);
}

function endSeek() {
  window.clearTimeout(seekEndTimer);
  seekEndTimer = undefined;
  state.isSeeking = false;
}

function handleFrameCurrentKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    if (frameCurrentInputDirty) {
      commitFrameCurrentInput();
    } else {
      updatePlaybackDisplay({ forceFrameInput: true });
    }
    dom.frameCurrentInput?.blur();
  } else if (event.key === "Escape") {
    event.preventDefault();
    frameCurrentInputDirty = false;
    updatePlaybackDisplay({ forceFrameInput: true });
    dom.frameCurrentInput?.blur();
  }
}

function handleFrameCurrentBlur() {
  if (frameCurrentInputDirty) {
    commitFrameCurrentInput();
  } else {
    updatePlaybackDisplay({ forceFrameInput: true });
  }
}

function commitFrameCurrentInput() {
  if (!(dom.frameCurrentInput instanceof window.HTMLInputElement)) {
    return;
  }
  const frame = parseFrameCurrentInput(dom.frameCurrentInput.value);
  frameCurrentInputDirty = false;
  if (frame === undefined) {
    updatePlaybackDisplay({ forceFrameInput: true });
    return;
  }
  seekToFrame(frame);
}

function parseFrameCurrentInput(value) {
  const numeric = Number(String(value).trim());
  return Number.isFinite(numeric) ? Math.round(numeric) : undefined;
}

function seekToFrame(frame) {
  const maxFrame = Math.max(Math.round(currentMotionDurationSeconds() * state.mmdFrameRate), 0);
  const targetFrame = Math.min(Math.max(frame, 0), maxFrame);
  state.isSeeking = true;
  state.elapsedSeconds = targetFrame / state.mmdFrameRate;
  if (dom.timeline) {
    dom.timeline.value = state.elapsedSeconds;
    dom.timeline.setAttribute("value", String(state.elapsedSeconds));
  }
  state.runtimePhysicsDisabledOptionsScratch.physics = false;
  evaluateRuntime(state.runtimePhysicsDisabledOptionsScratch);
  if (dom.frameCurrentInput instanceof window.HTMLInputElement) {
    dom.frameCurrentInput.value = String(targetFrame);
  }
  syncAudioToMotionTime();
  endSeek();
}

function initVolumeControls() {
  const { volume, muted } = readStoredVolume();
  applyVolumeState(volume, muted);
  updateVolumeIcon();
  // sl-range may not be upgraded yet on first paint; re-apply the stored value once it is.
  window.customElements?.whenDefined?.("sl-range").then(() => {
    applyVolumeState(volume, muted);
    updateVolumeIcon();
  });
}

function handleVolumeSliderInput() {
  if (!dom.volumeSlider) return;
  const volume = clampVolume(Number(dom.volumeSlider.value));
  const muted = volume === 0;
  applyVolumeState(volume, muted);
  persistVolume(volume, muted);
  updateVolumeIcon();
}

function handleAudioOffsetFrameInput() {
  if (!(dom.audioOffsetFrameInput instanceof window.HTMLInputElement)) return;
  setAudioOffsetFrame(dom.audioOffsetFrameInput.value, {
    fallback: false,
    updateInput: false
  });
}

function commitAudioOffsetFrameInput() {
  if (!(dom.audioOffsetFrameInput instanceof window.HTMLInputElement)) return;
  setAudioOffsetFrame(dom.audioOffsetFrameInput.value);
}

function applyStoredVolume() {
  const { volume, muted } = readStoredVolume();
  applyVolumeState(volume, muted);
  updateVolumeIcon();
}

function applyVolumeState(volume, muted) {
  const clampedVolume = clampVolume(volume);
  if (isAudioElement(dom.bgmAudio)) {
    dom.bgmAudio.volume = clampedVolume;
    dom.bgmAudio.muted = muted;
  }
  if (dom.volumeSlider) {
    dom.volumeSlider.setAttribute("value", String(clampedVolume));
    dom.volumeSlider.value = clampedVolume;
  }
}

function updateVolumeIcon() {
  if (!dom.volumeToggle) return;
  const audioElement = isAudioElement(dom.bgmAudio) ? dom.bgmAudio : undefined;
  const volume = audioElement ? audioElement.volume : 1;
  const muted = audioElement ? audioElement.muted : false;
  const iconName = muted || volume === 0 ? "volume-mute" : volume < 0.5 ? "volume-down" : "volume-up";
  dom.volumeToggle.name = iconName;
  dom.volumeToggle.setAttribute("name", iconName);
}

function readStoredVolume() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(volumeStorageKey) ?? "null");
    if (parsed && typeof parsed === "object") {
      const volume = Number(parsed.volume);
      return {
        volume: Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : 1,
        muted: parsed.muted === true
      };
    }
  } catch {
    // Ignore malformed storage.
  }
  return { volume: 1, muted: false };
}

function persistVolume(volume, muted) {
  try {
    window.localStorage.setItem(volumeStorageKey, JSON.stringify({
      volume: clampVolume(volume),
      muted: muted === true
    }));
  } catch {
    // Ignore storage failures.
  }
}

function clampVolume(volume) {
  return Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : 1;
}

function hasTimelineSource() {
  return hasCurrentMotion() || state.currentCameraMotion !== undefined;
}

function disposeViewerResources() {
  if (state.viewerDisposed) return;
  state.viewerDisposed = true;
  state.renderer.setAnimationLoop(null);
  clearModel();
  clearBackground();
  clearCameraMotion();
  resetFolderModelState();
  resetMotionSwitcherState();
  state.pendingMotionSource = undefined;
  state.pendingMotionLabel = undefined;
  clearAudioSource();
  disposeActivePhysicsBackend();
  state.frameTimer.dispose();
  state.controls.dispose();
  state.renderer.dispose();
  state.renderer.forceContextLoss?.();
}

