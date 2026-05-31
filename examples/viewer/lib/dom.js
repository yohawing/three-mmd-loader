import { currentMmdFrame, currentMotionDurationSeconds, hasCurrentMotion, state } from "./state.js";

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
  volumeControl: document.querySelector("#volume-control"),
  volumeSlider: document.querySelector("#volume-slider"),
  volumeToggle: document.querySelector("#volume-toggle"),
  playToggle: document.querySelector("#play-toggle"),
  playToggleIcon: document.querySelector("#play-toggle")?.querySelector(".material-symbols-rounded"),
  loadMenu: document.querySelector("#load-menu"),
  loadMenuIcon: document.querySelector("#load-menu-icon"),
  languageSelect: document.querySelector("#language-select"),
  debugMenu: document.querySelector("#debug-menu"),
  debugCollidersToggle: document.querySelector("#debug-colliders-toggle"),
  debugNormalsToggle: document.querySelector("#debug-normals-toggle"),
  debugToonOffToggle: document.querySelector("#debug-toon-off-toggle"),
  debugOutlineOffToggle: document.querySelector("#debug-outline-off-toggle"),
  debugSelfShadowToggle: document.querySelector("#debug-self-shadow-toggle"),
  debugMaxSubStepsInput: document.querySelector("#debug-max-sub-steps"),
  debugDynamicWithBoneFeedbackInput: document.querySelector("#debug-dynamic-with-bone-feedback"),
  debugCollisionMarginInput: document.querySelector("#debug-collision-margin"),
  debugSolverIterationsInput: document.querySelector("#debug-solver-iterations"),
  debugSplitImpulseToggle: document.querySelector("#debug-split-impulse-toggle"),
  debugSplitImpulsePenetrationThresholdInput: document.querySelector("#debug-split-impulse-threshold"),
  debugRefreshStateButton: document.querySelector("#debug-refresh-state"),
  debugStateOutput: document.querySelector("#debug-state-output"),
  appVersionText: document.querySelector("#app-version"),
  assetPresetSection: document.querySelector("#asset-preset-section"),
  assetPresetSelect: document.querySelector("#asset-preset-select"),
  assetPresetLoadButton: document.querySelector("#load-asset-preset"),
  assetPresetSaveButton: document.querySelector("#save-current-preset"),
  assetPresetDeleteButton: document.querySelector("#delete-asset-preset"),
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
  modelFolderInput: document.querySelector("#model-folder"),
  motionFileInput: document.querySelector("#motion-file"),
  poseFileInput: document.querySelector("#pose-file"),
  audioFileInput: document.querySelector("#audio-file"),
  backgroundFolderInput: document.querySelector("#background-folder"),
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
  updatePresetSectionVisibility();
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
  updatePresetSectionVisibility();
}

// The preset section hosts both the fixture preset picker and the "save current
// assets" control. Without local fixture data (e.g. the deployed demo) the
// entire section along with per-category fixture rows is removed from the DOM.
export function removeFixtureUi() {
  dom.assetPresetSection?.remove();
  dom.assetPresetSection = null;
  dom.assetPresetSelect = null;
  dom.assetPresetLoadButton = null;
  dom.assetPresetSaveButton = null;
  dom.assetPresetDeleteButton = null;

  for (const ref of ["assetModelSelect", "assetMotionSelect", "assetBackgroundSelect", "assetAudioSelect", "assetCameraSelect"]) {
    const sel = dom[ref];
    if (sel) {
      const row = sel.closest(".asset-load-row");
      row?.remove();
    }
    dom[ref] = null;
  }
  dom.assetModelLoadButton = null;
  dom.assetMotionLoadButton = null;
  dom.assetBackgroundLoadButton = null;
  dom.assetAudioLoadButton = null;
  dom.assetCameraLoadButton = null;
}

export function updatePresetSectionVisibility() {
  if (!dom.assetPresetSection) {
    return;
  }
  const hasPresets = (state.assetLibrary?.presets?.length ?? 0) > 0;
  const hasLoadedContent =
    state.currentModel !== undefined ||
    state.currentMotion !== undefined ||
    state.currentBackground !== undefined ||
    state.currentCameraMotion !== undefined ||
    state.currentAudioEntries.length > 0;
  dom.assetPresetSection.hidden = !(hasPresets || hasLoadedContent);
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

export function updatePlayToggle() {
  if (dom.playToggleIcon) {
    dom.playToggleIcon.textContent = state.isPlaying ? "pause" : "play_arrow";
  }
  dom.playToggle?.setAttribute("aria-label", state.isPlaying ? "Pause" : "Play");
}

export function updatePlaybackDisplay() {
  const totalFrames = Math.round(currentMotionDurationSeconds() * state.mmdFrameRate);
  const currentFrame = Math.round(currentMmdFrame());
  dom.frameValueText.textContent = `${currentFrame} / ${totalFrames}`;
}
