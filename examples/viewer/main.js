import { clearAudioSource, isAudioElement, loadAudioFile, loadAudioFromUrl, setAudioOffsetFrame, switchAudioEntry } from "./lib/audio-loading.js";
import { bindAssetLibraryControls, initializeAssetLibrary } from "./lib/asset-library.js";
import { clearBackground, loadBackgroundFile, loadBackgroundFolder, loadBackgroundFromUrl, switchBackgroundEntry } from "./lib/background-loading.js";
import { clearCameraMotion, loadCameraFile, loadCameraFromUrl, switchCameraEntry } from "./lib/camera-loading.js";
import { bindCreditPopupControls } from "./lib/credits.js";
import { captureCanvas, captureAfterAndCompare, createViewerDebugApi, markBeforeCapture, refreshDebugPanelState, setDebugMaterialMode, setOutlineHidden, setSelfShadowEnabled, toggleColliderHelpers } from "./lib/debug.js";
import { dom, loadedFileSwitcherValue, setStatus, toggleLoadMenu, updateChromeHeights, updatePlaybackDisplay, updatePlayToggle, updateStageState } from "./lib/dom.js";
import { getLocale, resolveInitialLocale, setLocale } from "./lib/i18n.js";
import { disposeActivePhysicsBackend } from "./lib/physics-backend.js";
import { loadModelFile, loadModelFolder, loadModelFromUrl, modelFileKey, bindDropTarget, clearModel, frameCurrentModel, resetFolderModelState, switchFolderModel } from "./lib/model-loading.js";
import { clearMotion, loadMotion, loadMotionFromUrl, loadPose, classifyVmdFiles, motionFileKey, resetMotionSwitcherState, switchMotion, updateMotionSwitcher } from "./lib/motion-loading.js";
import { evaluateRuntime, finishAudioTimeSync, render, renderStillFrame, setPlaybackPlaying, setPlaybackState, syncAudioToMotionTime, syncMotionToAudioTime } from "./lib/playback.js";
import {
  consumeRendererSwitchSnapshot,
  createRendererSwitchSnapshot,
  hasRendererSwitchSnapshotState,
  restoreFiles,
  saveRendererSwitchSnapshot,
  setRendererSwitchRestoreParam
} from "./lib/renderer-switch-state.js";
import { adaptCameraDepthRange, resize, setViewportAxesVisible, setViewportGridVisible, setupScene } from "./lib/scene-setup.js";
import { currentMotionDurationSeconds, debugEnabled, hasCurrentMotion, kurokoModelUrl, state } from "./lib/state.js";
import { updateViewerPipelineStatus } from "./lib/viewer-pipeline.js";

const volumeStorageKey = "three-mmd-loader.viewer.volume.v1";
let frameCurrentInputDirty = false;

const viewerApi = {
  get camera() { return state.camera; },
  get controls() { return state.controls; },
  get renderer() { return state.renderer; },
  get scene() { return state.scene; },
  loadModelUrl: loadModelFromUrl,
  loadMotionUrl: loadMotionFromUrl,
  loadBackgroundUrl: loadBackgroundFromUrl,
  loadCameraUrl: loadCameraFromUrl,
  frameModel: frameCurrentModel,
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

void initializeViewer();

async function initializeViewer() {
  try {
    await setupScene();
    initLocalization();
    initVolumeControls();
    // Warm browser cache for kuroko stand-in model (silent on failure).
    fetch(kurokoModelUrl).catch(() => {});
    bindControls();
    void initializeAssetLibrary();
    await restoreRendererSwitchState();
    resize();
    updateViewerPipelineStatus();
    state.frameTimer.update();
    state.renderer.setAnimationLoop(render);
  } catch (error) {
    state.rendererStatus = "error";
    updateViewerPipelineStatus();
    const message = error instanceof Error ? error.message : String(error);
    window.console?.error("[viewer] Failed to initialize:", error);
    setStatus(message, "error");
  }
}

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
  dom.pipelineBackendSwitcher?.addEventListener("sl-change", () => {
    const backend = dom.pipelineBackendSwitcher?.value;
    if (backend === "forcewebgl" || backend === "webgpu" || backend === "baseline") {
      void switchRendererBackend(backend);
    }
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
  dom.debugCaptureButton?.addEventListener("click", captureCanvas);
  dom.debugBeforeButton?.addEventListener("click", markBeforeCapture);
  dom.debugCompareAfterButton?.addEventListener("click", captureAfterAndCompare);
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
  state.renderer?.setAnimationLoop?.(null);
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
  state.controls?.dispose();
  state.renderer?.dispose();
  state.renderer?.forceContextLoss?.();
}

async function switchRendererBackend(backend) {
  if (backend === state.rendererBackend) {
    return;
  }
  const snapshot = createRendererSwitchSnapshot();
  const url = new URL(window.location.href);
  url.searchParams.delete("baseline");
  url.searchParams.delete("pipeline");
  url.searchParams.set("backend", backend);
  if (hasRendererSwitchSnapshotState(snapshot)) {
    try {
      const restoreId = await saveRendererSwitchSnapshot(snapshot);
      setRendererSwitchRestoreParam(url, restoreId);
    } catch (error) {
      window.console?.warn("[viewer] Failed to preserve renderer switch state:", error);
      const confirmed = window.confirm("Changing renderer backend reloads the viewer. Loaded files could not be preserved. Continue?");
      if (!confirmed) {
        updateViewerPipelineStatus();
        return;
      }
    }
  }
  window.location.assign(url);
}

async function restoreRendererSwitchState() {
  const snapshot = await consumeRendererSwitchSnapshot();
  if (!snapshot) {
    return;
  }
  setStatus("Restoring renderer switch state", "loading");
  if (snapshot.model) {
    await restoreRendererSwitchModel(snapshot.model);
  }
  if (snapshot.motion) {
    await restoreRendererSwitchMotion(snapshot.motion);
  }
  if (snapshot.pose) {
    await restoreRendererSwitchPose(snapshot.pose);
  }
  if (snapshot.background) {
    await restoreRendererSwitchBackground(snapshot.background);
  }
  if (snapshot.camera) {
    await restoreRendererSwitchCamera(snapshot.camera);
  }
  if (snapshot.audio) {
    restoreRendererSwitchAudio(snapshot.audio);
  }
  if (typeof snapshot.elapsedSeconds === "number") {
    state.elapsedSeconds = snapshot.elapsedSeconds;
    if (dom.timeline) {
      dom.timeline.value = snapshot.elapsedSeconds;
    }
    evaluateRuntime(state.runtimePhysicsDisabledOptionsScratch);
    syncAudioToMotionTime();
    updatePlaybackDisplay();
  }
  if (snapshot.cameraView) {
    restoreRendererSwitchCameraView(snapshot.cameraView);
  }
  if (typeof snapshot.debugSelfShadowEnabled === "boolean") {
    setSelfShadowEnabled(snapshot.debugSelfShadowEnabled);
  }
  state.debugBeforeCapture = snapshot.debugBeforeCapture;
  refreshDebugPanelState();
  renderStillFrame();
  setStatus("", "ready");
}

async function restoreRendererSwitchModel(model) {
  const restoreModelLoadOptions = { autoFitCamera: false };
  if (model.kind === "url") {
    await loadModelFromUrl(model.url, restoreModelLoadOptions);
    return;
  }
  if (model.kind === "folder") {
    const files = restoreFiles(model.files);
    await loadModelFolder(files, restoreModelLoadOptions);
    const selectedModel = state.currentFolderPmxFiles.find((file) => modelFileKey(file) === model.selectedKey);
    if (selectedModel) {
      await switchFolderModel(selectedModel, restoreModelLoadOptions);
    }
    return;
  }
  if (model.kind === "file") {
    await loadModelFile(restoreFiles([model.file])[0], restoreModelLoadOptions);
  }
}

async function restoreRendererSwitchMotion(motion) {
  if (motion.kind === "url") {
    await loadMotionFromUrl(motion.url);
    return;
  }
  if (motion.kind === "file") {
    const motionFiles = restoreFiles(motion.files?.length > 0 ? motion.files : [motion.file]);
    const selectedMotion = motionFiles.find((file) => motionFileKey(file) === motion.selectedKey) ?? restoreFiles([motion.file])[0];
    state.currentMotionVmdFiles = motionFiles;
    updateMotionSwitcher(selectedMotion);
    await loadMotion(selectedMotion);
  }
}

async function restoreRendererSwitchPose(pose) {
  if (pose.kind === "url") {
    await loadPose(pose.url, pose.label);
    return;
  }
  if (pose.kind === "file") {
    await loadPose(restoreFiles([pose.file])[0], pose.label);
  }
}

async function restoreRendererSwitchBackground(background) {
  if (background.kind === "url") {
    await loadBackgroundFromUrl(background.url);
    return;
  }
  if (background.kind === "folder") {
    await loadBackgroundFolder(restoreFiles(background.files));
    return;
  }
  if (background.kind === "file") {
    await loadBackgroundFile(restoreFiles([background.file])[0]);
  }
}

async function restoreRendererSwitchCamera(camera) {
  if (camera.kind === "url") {
    await loadCameraFromUrl(camera.url);
    return;
  }
  if (camera.kind === "file") {
    await loadCameraFile(restoreFiles([camera.file])[0]);
  }
}

function restoreRendererSwitchCameraView(view) {
  const camera = view.active === "orthographic" ? state.orthographicCamera : state.perspectiveCamera;
  if (!camera || !state.controls) {
    return;
  }
  state.camera = camera;
  state.controls.object = camera;
  camera.position.fromArray(view.position);
  camera.quaternion.fromArray(view.quaternion);
  camera.up.fromArray(view.up);
  const hasSavedDepthRange = typeof view.near === "number" && typeof view.far === "number";
  if (hasSavedDepthRange) {
    camera.near = view.near;
    camera.far = view.far;
  }
  if (camera === state.perspectiveCamera && typeof view.fov === "number") {
    camera.fov = view.fov;
  }
  if (typeof view.zoom === "number") {
    camera.zoom = view.zoom;
  }
  state.controls.target.fromArray(view.target);
  camera.updateProjectionMatrix();
  state.controls.update();
  if (!hasSavedDepthRange) {
    // Restore data predates near/far capture (or omitted it) -- recompute
    // from current scene bounds instead of leaving the wide viewer default.
    adaptCameraDepthRange();
  }
}

function restoreRendererSwitchAudio(audio) {
  if (audio.kind === "url") {
    loadAudioFromUrl(audio.url, audio.name, { offsetFrame: audio.offsetFrame });
    return;
  }
  if (audio.kind === "file") {
    loadAudioFile(restoreFiles([audio.file])[0]);
    setAudioOffsetFrame(audio.offsetFrame ?? 0, { sync: false });
  }
}

