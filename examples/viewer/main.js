import { clearAudioSource, isAudioElement, loadAudioFile, switchAudioEntry } from "./lib/audio-loading.js";
import { bindAssetLibraryControls, initializeAssetLibrary } from "./lib/asset-library.js";
import { clearBackground, loadBackgroundFile, loadBackgroundFromUrl, switchBackgroundEntry } from "./lib/background-loading.js";
import { clearCameraMotion, loadCameraFile, loadCameraFromUrl, switchCameraEntry } from "./lib/camera-loading.js";
import { createViewerDebugApi } from "./lib/debug.js";
import { dom, setStatus, toggleLoadMenu, updatePlaybackDisplay, updateStageState } from "./lib/dom.js";
import { disposeActivePhysicsBackend } from "./lib/ammo-bootstrap.js";
import { loadModel, loadModelFolder, loadModelFromUrl, modelFileKey, bindDropTarget, clearModel, resetFolderModelState, switchFolderModel } from "./lib/model-loading.js";
import { clearMotion, loadMotion, loadMotionFromUrl, loadPose, motionFileKey, resetMotionSwitcherState, switchMotion, updateMotionSwitcher } from "./lib/motion-loading.js";
import { evaluateRuntime, finishAudioTimeSync, render, renderStillFrame, setPlaybackPlaying, setPlaybackState, syncAudioToMotionTime, syncMotionToAudioTime } from "./lib/playback.js";
import { resize, setupScene } from "./lib/scene-setup.js";
import { debugEnabled, hasCurrentMotion, state } from "./lib/state.js";

setupScene();

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
}
window.mmdViewer = viewerApi;

bindControls();
void initializeAssetLibrary();
resize();
state.clock.getDelta();
state.renderer.setAnimationLoop(render);

function bindControls() {
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", disposeViewerResources, { once: true });
  window.addEventListener("beforeunload", disposeViewerResources, { once: true });
  dom.loadMenu?.querySelector("summary")?.addEventListener("click", toggleLoadMenu);
  document.querySelector("#choose-model-file")?.addEventListener("click", () => dom.modelFileInput?.click());
  document.querySelector("#choose-model-folder")?.addEventListener("click", () => dom.modelFolderInput?.click());
  document.querySelector("#choose-motion")?.addEventListener("click", () => dom.motionFileInput?.click());
  document.querySelector("#choose-pose")?.addEventListener("click", () => dom.poseFileInput?.click());
  document.querySelector("#choose-audio")?.addEventListener("click", () => dom.audioFileInput?.click());
  document.querySelector("#choose-background")?.addEventListener("click", () => dom.backgroundFileInput?.click());
  document.querySelector("#choose-camera")?.addEventListener("click", () => dom.cameraFileInput?.click());
  bindAssetLibraryControls();
  dom.modelFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) void loadModel(file);
  });
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
      state.currentMotionVmdFiles = [file];
      updateMotionSwitcher(file);
      void loadMotion(file);
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
  dom.backgroundFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) void loadBackgroundFile(file);
  });
  dom.cameraFileInput?.addEventListener("change", (event) => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (file) void loadCameraFile(file);
  });
  dom.playToggle?.addEventListener("click", () => {
    void setPlaybackPlaying(!state.isPlaying);
  });
  dom.timeline?.addEventListener("input", () => {
    state.isSeeking = true;
    state.elapsedSeconds = Number.parseFloat(dom.timeline.value);
    evaluateRuntime({ physics: false });
    syncAudioToMotionTime();
  });
  dom.timeline?.addEventListener("change", () => {
    state.isSeeking = false;
  });
  if (isAudioElement(dom.bgmAudio)) {
    dom.bgmAudio.addEventListener("play", () => {
      if (!state.isSyncingAudioState && hasTimelineSource()) setPlaybackState(true);
    });
    dom.bgmAudio.addEventListener("pause", () => {
      if (!state.isSyncingAudioState && hasTimelineSource()) setPlaybackState(false);
    });
    dom.bgmAudio.addEventListener("seeking", syncMotionToAudioTime);
    dom.bgmAudio.addEventListener("seeked", () => {
      if (finishAudioTimeSync()) return;
      syncMotionToAudioTime();
    });
    dom.bgmAudio.addEventListener("timeupdate", () => {
      if (!state.isPlaying || !hasTimelineSource()) return;
      syncMotionToAudioTime({ evaluate: false });
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
  state.controls.dispose();
  state.renderer.dispose();
  state.renderer.forceContextLoss?.();
}

