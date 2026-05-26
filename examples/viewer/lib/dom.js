import { currentMotionDurationSeconds, hasCurrentMotion, state } from "./state.js";

export const dom = {
  canvas: document.querySelector("#viewer-canvas"),
  stage: document.querySelector(".stage"),
  topBar: document.querySelector(".top-bar"),
  transportBar: document.querySelector(".transport"),
  viewerShell: document.querySelector(".viewer-shell"),
  statusText: document.querySelector("#status"),
  physicsErrorBanner: document.querySelector("#physics-error"),
  loadingIndicator: document.querySelector("#loading-indicator"),
  loadingMessageText: document.querySelector("#loading-message"),
  modelControl: document.querySelector("#model-control"),
  modelSwitcher: document.querySelector("#model-switcher"),
  modelClearButton: document.querySelector("#clear-model"),
  motionControl: document.querySelector("#motion-control"),
  motionSwitcher: document.querySelector("#motion-switcher"),
  motionClearButton: document.querySelector("#clear-motion"),
  audioControl: document.querySelector("#audio-control"),
  audioSwitcher: document.querySelector("#audio-switcher"),
  audioClearButton: document.querySelector("#clear-audio"),
  backgroundControl: document.querySelector("#background-control"),
  backgroundSwitcher: document.querySelector("#background-switcher"),
  backgroundClearButton: document.querySelector("#clear-background"),
  cameraControl: document.querySelector("#camera-control"),
  cameraSwitcher: document.querySelector("#camera-switcher"),
  cameraClearButton: document.querySelector("#clear-camera"),
  frameValueText: document.querySelector("#frame-value"),
  timeline: document.querySelector("#timeline"),
  playToggle: document.querySelector("#play-toggle"),
  playToggleIcon: document.querySelector("#play-toggle")?.querySelector(".material-symbols-rounded"),
  loadMenu: document.querySelector("#load-menu"),
  loadMenuIcon: document.querySelector("#load-menu-icon"),
  assetPresetSection: document.querySelector("#asset-preset-section"),
  assetPresetSelect: document.querySelector("#asset-preset-select"),
  assetPresetLoadButton: document.querySelector("#load-asset-preset"),
  assetPresetSaveButton: document.querySelector("#save-current-preset"),
  assetModelSelect: document.querySelector("#asset-model-select"),
  assetModelLoadButton: document.querySelector("#load-asset-model"),
  assetMotionSelect: document.querySelector("#asset-motion-select"),
  assetMotionLoadButton: document.querySelector("#load-asset-motion"),
  assetBackgroundSelect: document.querySelector("#asset-background-select"),
  assetBackgroundLoadButton: document.querySelector("#load-asset-background"),
  assetAudioSelect: document.querySelector("#asset-audio-select"),
  assetAudioLoadButton: document.querySelector("#load-asset-audio"),
  assetCameraSelect: document.querySelector("#asset-camera-select"),
  assetCameraLoadButton: document.querySelector("#load-asset-camera"),
  recentModelSelect: document.querySelector("#recent-model-select"),
  recentModelLoadButton: document.querySelector("#load-recent-model"),
  recentMotionSelect: document.querySelector("#recent-motion-select"),
  recentMotionLoadButton: document.querySelector("#load-recent-motion"),
  recentBackgroundSelect: document.querySelector("#recent-background-select"),
  recentBackgroundLoadButton: document.querySelector("#load-recent-background"),
  recentAudioSelect: document.querySelector("#recent-audio-select"),
  recentAudioLoadButton: document.querySelector("#load-recent-audio"),
  recentCameraSelect: document.querySelector("#recent-camera-select"),
  recentCameraLoadButton: document.querySelector("#load-recent-camera"),
  modelFileInput: document.querySelector("#model-file"),
  modelFolderInput: document.querySelector("#model-folder"),
  motionFileInput: document.querySelector("#motion-file"),
  poseFileInput: document.querySelector("#pose-file"),
  audioFileInput: document.querySelector("#audio-file"),
  backgroundFileInput: document.querySelector("#background-file"),
  cameraFileInput: document.querySelector("#camera-file"),
  bgmAudio: document.querySelector("#bgm-audio")
};

export function setStatus(message, state = "ready") {
  dom.statusText.textContent = message;
  dom.statusText.classList.toggle("is-loading", state === "loading");
  dom.topBar?.classList.toggle("is-error", state === "error");
  dom.topBar?.classList.toggle("is-warning", state === "warning");
  setLoadingIndicator(state === "loading", message);
}

export function setDisplayedText(element, text) {
  if (element) {
    element.textContent = text;
    element.hidden = text.length === 0;
  }
}

export function closeLoadMenu() {
  dom.loadMenu?.removeAttribute("open");
  updateLoadMenuIcon();
}

export function toggleLoadMenu(event) {
  event?.preventDefault();
  if (dom.loadMenu) {
    dom.loadMenu.toggleAttribute("open");
  }
  updateLoadMenuIcon();
}

export function updateLoadMenuIcon() {
  if (dom.loadMenuIcon) {
    dom.loadMenuIcon.textContent = dom.loadMenu?.hasAttribute("open") ? "close" : "menu";
  }
}

function setLoadingIndicator(loading, message) {
  if (dom.loadingIndicator) {
    dom.loadingIndicator.hidden = !loading;
  }
  if (dom.loadingMessageText) {
    dom.loadingMessageText.textContent = message || "Loading";
  }
}

export function updateStageState() {
  dom.stage?.classList.toggle("is-empty", !state.currentModel && !state.currentBackground);
}

export function updateTransportState() {
  const hasTimelineSource = hasCurrentMotion() || state.currentCameraMotion !== undefined;
  if (dom.transportBar) {
    dom.transportBar.hidden = !hasTimelineSource;
  }
  if (dom.bgmAudio instanceof window.HTMLAudioElement) {
    dom.bgmAudio.loop = hasCurrentMotion();
  }
  dom.viewerShell?.classList.toggle("has-motion", hasTimelineSource);
}

export function updateChromeHeights() {
  if (!dom.viewerShell || !dom.topBar) {
    return;
  }
  dom.viewerShell.style.setProperty("--top-bar-height", `${dom.topBar.offsetHeight}px`);
  if (dom.transportBar) {
    dom.viewerShell.style.setProperty("--transport-height", `${dom.transportBar.offsetHeight}px`);
  }
}

export function formatTime(seconds) {
  const safeSeconds = Math.max(Number.isFinite(seconds) ? seconds : 0, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}

export function updatePlayToggle() {
  if (dom.playToggleIcon) {
    dom.playToggleIcon.textContent = state.isPlaying ? "pause" : "play_arrow";
  }
  dom.playToggle?.setAttribute("aria-label", state.isPlaying ? "Pause" : "Play");
}

export function updatePlaybackDisplay() {
  const duration = currentMotionDurationSeconds();
  const currentTime = Number.isFinite(state.elapsedSeconds) ? state.elapsedSeconds : 0;
  dom.frameValueText.textContent = formatTime(currentTime) + " / " + formatTime(duration);
}
