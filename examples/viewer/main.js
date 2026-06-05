import { clearAudioSource, isAudioElement, loadAudioFile, switchAudioEntry } from "./lib/audio-loading.js";
import { bindAssetLibraryControls, initializeAssetLibrary } from "./lib/asset-library.js";
import { clearBackground, loadBackgroundFolder, loadBackgroundFromUrl, switchBackgroundEntry } from "./lib/background-loading.js";
import { clearCameraMotion, loadCameraFile, loadCameraFromUrl, switchCameraEntry } from "./lib/camera-loading.js";
import { bindCreditPopupControls } from "./lib/credits.js";
import { createViewerDebugApi, refreshDebugPanelState, setDebugMaterialMode, setOutlineHidden, setSelfShadowEnabled, toggleColliderHelpers } from "./lib/debug.js";
import { dom, setStatus, toggleLoadMenu, updateChromeHeights, updatePlaybackDisplay, updateStageState } from "./lib/dom.js";
import { getLocale, resolveInitialLocale, setLocale } from "./lib/i18n.js";
import { disposeActivePhysicsBackend } from "./lib/ammo-bootstrap.js";
import { loadModelFolder, loadModelFromUrl, modelFileKey, bindDropTarget, clearModel, resetFolderModelState, switchFolderModel } from "./lib/model-loading.js";
import { clearMotion, loadMotion, loadMotionFromUrl, loadPose, classifyVmdFiles, motionFileKey, resetMotionSwitcherState, switchMotion, updateMotionSwitcher } from "./lib/motion-loading.js";
import { evaluateRuntime, finishAudioTimeSync, render, renderStillFrame, setPlaybackPlaying, setPlaybackState, syncAudioToMotionTime, syncMotionToAudioTime } from "./lib/playback.js";
import { resize, setupScene } from "./lib/scene-setup.js";
import { debugEnabled, hasCurrentMotion, state } from "./lib/state.js";

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
  bindDebugControls();
  dom.modelFolderInput?.addEventListener("change", (event) => {
    const files = event.target instanceof HTMLInputElement ? event.target.files : undefined;
    if (files && files.length > 0) void loadModelFolder(Array.from(files));
  });
  dom.modelSwitcher?.addEventListener("change", () => {
    if (!(dom.modelSwitcher instanceof window.HTMLSelectElement)) return;
    const selectedFile = state.currentFolderPmxFiles.find((file) => modelFileKey(file) === dom.modelSwitcher.value);
    if (selectedFile) void switchFolderModel(selectedFile);
  });
  dom.modelClearButton?.addEventListener("click", () => {
    clearModel();
    renderStillFrame();
  });
  dom.motionSwitcher?.addEventListener("change", () => {
    if (!(dom.motionSwitcher instanceof window.HTMLSelectElement)) return;
    const selectedFile = state.currentMotionVmdFiles.find((file) => motionFileKey(file) === dom.motionSwitcher.value);
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
  dom.motionClearButton?.addEventListener("click", () => {
    clearMotion();
  });
  dom.audioSwitcher?.addEventListener("change", () => {
    if (!(dom.audioSwitcher instanceof window.HTMLSelectElement)) return;
    const selectedEntry = state.currentAudioEntries.find((entry) => entry.id === dom.audioSwitcher.value);
    switchAudioEntry(selectedEntry);
  });
  dom.audioClearButton?.addEventListener("click", () => {
    clearAudioSource();
  });
  dom.backgroundSwitcher?.addEventListener("change", () => {
    if (!(dom.backgroundSwitcher instanceof window.HTMLSelectElement)) return;
    const selectedEntry = state.currentBackgroundEntries.find((entry) => entry.id === dom.backgroundSwitcher.value);
    if (selectedEntry) void switchBackgroundEntry(selectedEntry);
  });
  dom.backgroundClearButton?.addEventListener("click", () => {
    clearBackground();
    renderStillFrame();
  });
  dom.cameraSwitcher?.addEventListener("change", () => {
    if (!(dom.cameraSwitcher instanceof window.HTMLSelectElement)) return;
    const selectedEntry = state.currentCameraEntries.find((entry) => entry.id === dom.cameraSwitcher.value);
    if (selectedEntry) void switchCameraEntry(selectedEntry);
  });
  dom.cameraClearButton?.addEventListener("click", () => {
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
  dom.volumeSlider?.addEventListener("sl-input", () => {
    if (!dom.volumeSlider) return;
    const volume = Number(dom.volumeSlider.value);
    if (isAudioElement(dom.bgmAudio)) {
      dom.bgmAudio.volume = volume;
      dom.bgmAudio.muted = volume === 0;
    }
    persistVolume(volume, volume === 0);
    updateVolumeIcon();
  });
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
    dom.bgmAudio.addEventListener("loadedmetadata", () => setStatus("", "ready"));
    dom.bgmAudio.addEventListener("error", () => {
      const message = "Failed to load audio source.";
      window.console?.warn("[viewer]", message, dom.bgmAudio.error);
      setStatus(message, "error");
    });
  }
  bindDropTarget();
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

const volumeStorageKey = "three-mmd-loader.viewer.volume.v1";

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

function initVolumeControls() {
  const { volume, muted } = readStoredVolume();
  if (isAudioElement(dom.bgmAudio)) {
    dom.bgmAudio.volume = volume;
    dom.bgmAudio.muted = muted;
  }
  if (dom.volumeSlider) {
    dom.volumeSlider.setAttribute("value", String(volume));
    dom.volumeSlider.value = volume;
  }
  updateVolumeIcon();
  // sl-range may not be upgraded yet on first paint; re-apply the stored value once it is.
  window.customElements?.whenDefined?.("sl-range").then(() => {
    if (dom.volumeSlider) {
      dom.volumeSlider.value = volume;
    }
    updateVolumeIcon();
  });
}

function updateVolumeIcon() {
  if (!dom.volumeToggle) return;
  const audioElement = isAudioElement(dom.bgmAudio) ? dom.bgmAudio : undefined;
  const volume = audioElement ? audioElement.volume : 1;
  const muted = audioElement ? audioElement.muted : false;
  dom.volumeToggle.name = muted || volume === 0 ? "volume-mute" : volume < 0.5 ? "volume-down" : "volume-up";
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
    window.localStorage.setItem(volumeStorageKey, JSON.stringify({ volume, muted }));
  } catch {
    // Ignore storage failures.
  }
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

