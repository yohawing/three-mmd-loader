import { clearAudioSource, isAudioElement, loadAudioFile } from "./lib/audio-loading.js";
import { createViewerDebugApi } from "./lib/debug.js";
import { closeLoadMenu, dom, setStatus, updatePlaybackDisplay, updateStageState } from "./lib/dom.js";
import { disposeActivePhysicsBackend } from "./lib/ammo-bootstrap.js";
import { loadModel, loadModelFolder, loadModelFromUrl, modelFileKey, bindDropTarget, clearModel, resetFolderModelState, switchFolderModel } from "./lib/model-loading.js";
import { loadMotion, loadMotionFromUrl, loadPose, resetMotionSwitcherState, switchMotion, updateMotionSwitcher } from "./lib/motion-loading.js";
import { evaluateRuntime, render, setPlaybackPlaying, setPlaybackState, syncAudioToMotionTime, syncMotionToAudioTime } from "./lib/playback.js";
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
  get currentModel() { return state.currentModel; },
  get currentMotion() { return state.currentMotion; }
};
if (debugEnabled) {
  viewerApi.debug = createViewerDebugApi();
}
window.mmdViewer = viewerApi;

bindControls();
resize();
state.clock.getDelta();
state.renderer.setAnimationLoop(render);

function bindControls() {
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", disposeViewerResources, { once: true });
  window.addEventListener("beforeunload", disposeViewerResources, { once: true });
  document.addEventListener("click", (event) => {
    if (dom.loadMenu && !dom.loadMenu.contains(event.target)) closeLoadMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.loadMenu) {
      closeLoadMenu();
      dom.loadMenu.querySelector("summary")?.focus();
    }
  });
  dom.loadMenu?.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => closeLoadMenu());
  });
  document.querySelector("#choose-model-file")?.addEventListener("click", () => dom.modelFileInput?.click());
  document.querySelector("#choose-model-folder")?.addEventListener("click", () => dom.modelFolderInput?.click());
  document.querySelector("#choose-motion")?.addEventListener("click", () => dom.motionFileInput?.click());
  document.querySelector("#choose-pose")?.addEventListener("click", () => dom.poseFileInput?.click());
  document.querySelector("#choose-audio")?.addEventListener("click", () => dom.audioFileInput?.click());
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
  dom.motionSwitcher?.addEventListener("change", () => {
    if (!(dom.motionSwitcher instanceof window.HTMLSelectElement)) return;
    const selectedFile = state.currentMotionVmdFiles.find((file) => file.name === dom.motionSwitcher.value);
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
      if (!state.isSyncingAudioState && hasCurrentMotion()) setPlaybackState(true);
    });
    dom.bgmAudio.addEventListener("pause", () => {
      if (!state.isSyncingAudioState && hasCurrentMotion()) setPlaybackState(false);
    });
    dom.bgmAudio.addEventListener("seeking", syncMotionToAudioTime);
    dom.bgmAudio.addEventListener("seeked", syncMotionToAudioTime);
    dom.bgmAudio.addEventListener("timeupdate", () => {
      if (!state.isPlaying || !hasCurrentMotion()) return;
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

function disposeViewerResources() {
  if (state.viewerDisposed) return;
  state.viewerDisposed = true;
  state.renderer.setAnimationLoop(null);
  clearModel();
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

