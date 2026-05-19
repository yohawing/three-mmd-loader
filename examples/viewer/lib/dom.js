import { currentMotionDurationSeconds, hasCurrentMotion, state } from "./state.js";

export const dom = {
  canvas: document.querySelector("#viewer-canvas"),
  stage: document.querySelector(".stage"),
  topBar: document.querySelector(".top-bar"),
  transportBar: document.querySelector(".transport"),
  viewerShell: document.querySelector(".viewer-shell"),
  statusText: document.querySelector("#status"),
  physicsErrorBanner: document.querySelector("#physics-error"),
  modelSwitcher: document.querySelector("#model-switcher"),
  motionSwitcher: document.querySelector("#motion-switcher"),
  audioNameText: document.querySelector("#audio-name"),
  frameValueText: document.querySelector("#frame-value"),
  timeline: document.querySelector("#timeline"),
  playToggle: document.querySelector("#play-toggle"),
  playToggleIcon: document.querySelector("#play-toggle")?.querySelector(".material-symbols-rounded"),
  loadMenu: document.querySelector("#load-menu"),
  modelFileInput: document.querySelector("#model-file"),
  modelFolderInput: document.querySelector("#model-folder"),
  motionFileInput: document.querySelector("#motion-file"),
  poseFileInput: document.querySelector("#pose-file"),
  audioFileInput: document.querySelector("#audio-file"),
  bgmAudio: document.querySelector("#bgm-audio")
};

export function setStatus(message, state = "ready") {
  dom.statusText.textContent = message;
  dom.statusText.classList.toggle("is-loading", state === "loading");
  dom.topBar?.classList.toggle("is-error", state === "error");
  dom.topBar?.classList.toggle("is-warning", state === "warning");
}

export function setDisplayedText(element, text) {
  if (element) {
    element.textContent = text;
    element.hidden = text.length === 0;
  }
}

export function closeLoadMenu() {
  dom.loadMenu?.removeAttribute("open");
}

export function updateStageState() {
  dom.stage?.classList.toggle("is-empty", !state.currentModel);
}

export function updateTransportState() {
  const hasMotion = hasCurrentMotion();
  if (dom.transportBar) {
    dom.transportBar.hidden = !hasMotion;
  }
  if (dom.bgmAudio instanceof window.HTMLAudioElement) {
    dom.bgmAudio.loop = hasMotion;
  }
  dom.viewerShell?.classList.toggle("has-motion", hasMotion);
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
