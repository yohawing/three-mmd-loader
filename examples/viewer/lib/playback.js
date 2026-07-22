import { dom, setStatus, updatePlayToggle, updatePlaybackDisplay } from "./dom.js";
import { hasActiveAudioSource, isAudioElement } from "./audio-loading.js";
import { applyCameraMotion } from "./camera-loading.js";
import { updateColliderHelpers, updateDebugFps } from "./debug.js";
import { currentMmdFrame, currentMmdSeconds, hasCurrentMotion, state } from "./state.js";
import { sampleMmdAnimWasmLightTrackInto, sampleMmdLightTrackInto, sampleMmdSelfShadowTrackInto } from "../../../dist/runtime/index.js";
import {
  applyMmdLightStateToThreeDirectionalLight,
  applyMmdSelfShadowStateToThreeDirectionalLight,
  syncMmdSelfShadowState,
  syncMmdSpecularDirection
} from "../../../dist/three/index.js";
import { updateSelfShadowDepthBias, updateShadowCameraForFrame } from "./scene-setup.js";
import {
  isTslViewerPipeline,
  submitViewerRender,
  syncMmdTslDedicatedShadowVisibility,
  syncViewerTslLight,
  syncCurrentModelTslMaterialStates
} from "./viewer-pipeline.js";

export function render() {
  state.frameTimer.update();
  const delta = state.frameTimer.getDelta();
  updateDebugFps(delta);
  if (state.isPlaying && !state.isSeeking) {
    state.elapsedSeconds += delta;
    void syncAudioPlaybackToTimeline();
  }
  evaluateRuntime();
  updateColliderHelpers();
  state.controls.update();
  applyCameraMotion();
  submitViewerRender();
}

export function renderStillFrame() {
  state.selfShadowBoundsRefreshCountdown = 0;
  evaluateRuntime();
  updateColliderHelpers();
  state.controls.update();
  applyCameraMotion();
  submitViewerRender();
}

export function evaluateRuntime(options) {
  const maxTime = Number(dom.timeline?.max ?? 10);
  if (state.elapsedSeconds > maxTime && maxTime > 0) {
    state.elapsedSeconds %= maxTime;
    syncAudioToMotionTime();
    void syncAudioPlaybackToTimeline();
  }
  if (state.currentModel?.runtime) {
    const updateOptions = state.runtimeUpdateOptionsScratch;
    updateOptions.ik = options?.ik ?? hasCurrentMotion();
    updateOptions.physics =
      state.physicsEnabled && (options?.physics ?? (!state.isSeeking && state.elapsedSeconds > 0));
    state.currentModel.update(currentMmdSeconds(), updateOptions);
    syncCurrentModelTslMaterialStates();
  }
  applyLightMotion();
  if (state.currentModel?.mesh) {
    updateShadowCameraForFrame(state.currentModel.mesh);
  }
  applySelfShadowMotion();
  if (dom.timeline) {
    dom.timeline.value = state.elapsedSeconds;
  }
  updatePlaybackDisplay();
}

function applyLightMotion() {
  const cameraMotion = state.currentCameraMotion;
  const lightState = cameraMotion?.lightTrack
    ? sampleMmdAnimWasmLightTrackInto(
        cameraMotion.lightTrack,
        currentMmdFrame(),
        state.lightSampleScratch,
        state.lightStateScratch
      )
    : cameraMotion?.lightFrames?.length > 0
      ? sampleMmdLightTrackInto(cameraMotion.lightFrames, currentMmdFrame(), state.lightStateScratch)
      : state.currentModel?.runtime?.lightState?.();
  if (!lightState || !state.keyLight) {
    return;
  }
  applyMmdLightStateToThreeDirectionalLight(state.keyLight, lightState, {
    target: state.controls.target,
    directionScratch: state.lightDirectionScratch
  });
  if (isTslViewerPipeline()) {
    syncViewerTslLight();
  } else {
    if (state.currentModel?.mesh?.material) {
      syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
    }
    if (state.currentBackground?.mesh?.material) {
      syncMmdSpecularDirection(state.currentBackground.mesh.material, state.keyLight);
    }
  }
}

function applySelfShadowMotion() {
  if (!state.keyLight) {
    return;
  }
  if (!state.debugSelfShadowEnabled) {
    state.keyLight.castShadow = false;
    syncLegacyMmdSelfShadowState({ mode: 0, distance: 0 });
    updateSelfShadowDepthBias();
    syncMmdTslDedicatedShadowVisibility();
    return;
  }
  const frames = state.currentMotion?.animation?.selfShadowFrames;
  if (!frames || frames.length === 0) {
    state.selfShadowStateScratch.mode = 1;
    state.selfShadowStateScratch.distance = 0.4;
    state.keyLight.castShadow = true;
    state.selfShadowFrameHint.index = 0;
    syncLegacyMmdSelfShadowState(state.selfShadowStateScratch);
    updateSelfShadowDepthBias();
    syncMmdTslDedicatedShadowVisibility();
    return;
  }
  const selfShadowState = sampleMmdSelfShadowTrackInto(
    frames,
    currentMmdFrame(),
    state.selfShadowStateScratch,
    state.selfShadowFrameHint
  );
  state.selfShadowLightOptionsScratch.minFar = state.keyLight.shadow.camera.far;
  state.selfShadowLightOptionsScratch.maxFar = Math.max(100, state.selfShadowLightOptionsScratch.minFar);
  applyMmdSelfShadowStateToThreeDirectionalLight(
    state.keyLight,
    selfShadowState,
    state.selfShadowLightOptionsScratch
  );
  syncLegacyMmdSelfShadowState(selfShadowState);
  updateSelfShadowDepthBias();
  syncMmdTslDedicatedShadowVisibility();
}

function syncLegacyMmdSelfShadowState(selfShadowState) {
  if (isTslViewerPipeline()) {
    return;
  }
  if (state.currentModel?.mesh?.material) {
    syncMmdSelfShadowState(state.currentModel.mesh.material, selfShadowState);
  }
  if (state.currentBackground?.mesh?.material) {
    syncMmdSelfShadowState(state.currentBackground.mesh.material, selfShadowState);
  }
}

export async function setPlaybackPlaying(playing) {
  setPlaybackState(playing);
  if (!isAudioElement(dom.bgmAudio) || !hasActiveAudioSource()) {
    return;
  }
  try {
    if (playing) {
      await syncAudioPlaybackToTimeline();
    } else {
      dom.bgmAudio.pause();
    }
  } catch (error) {
    setPlaybackState(false);
    const message = error instanceof Error ? error.message : String(error);
    window.console?.warn("[viewer] Failed to update audio playback:", error);
    setStatus(message, "error");
  } finally {
    state.isSyncingAudioState = false;
  }
}

export function setPlaybackState(playing) {
  state.isPlaying = playing;
  updatePlayToggle();
}

export function syncPlaybackToCurrentAudioState() {
  if (!isAudioElement(dom.bgmAudio) || !hasTimelineSource() || dom.bgmAudio.paused) {
    return;
  }
  setPlaybackState(true);
}

function hasTimelineSource() {
  return hasCurrentMotion() || state.currentCameraMotion !== undefined;
}

async function syncAudioPlaybackToTimeline() {
  if (!isAudioElement(dom.bgmAudio) || !hasActiveAudioSource()) {
    return;
  }
  if (state.elapsedSeconds < state.audioOffsetSeconds) {
    syncAudioToMotionTime();
    return;
  }
  if (!state.isPlaying || !dom.bgmAudio.paused || state.isSyncingAudioState) {
    return;
  }
  state.isSyncingAudioState = true;
  try {
    syncAudioToMotionTime();
    await dom.bgmAudio.play();
  } catch (error) {
    setPlaybackState(false);
    const message = error instanceof Error ? error.message : String(error);
    window.console?.warn("[viewer] Failed to start audio at the configured frame:", error);
    setStatus(message, "error");
  }
}

export function syncAudioToMotionTime(options) {
  const active = hasActiveAudioSource();
  if (!isAudioElement(dom.bgmAudio) || !active) {
    return;
  }
  if (state.elapsedSeconds < state.audioOffsetSeconds && !dom.bgmAudio.paused) {
    state.isSyncingAudioState = true;
    try {
      dom.bgmAudio.pause();
    } finally {
      state.isSyncingAudioState = false;
    }
  }
  const duration = Number.isFinite(dom.bgmAudio.duration) ? dom.bgmAudio.duration : undefined;
  const offsetTargetTime = state.elapsedSeconds - state.audioOffsetSeconds;
  const targetTime = duration ? Math.min(Math.max(offsetTargetTime, 0), Math.max(duration - 0.001, 0)) : Math.max(offsetTargetTime, 0);
  if (options?.onlyIfDrifted && Math.abs(dom.bgmAudio.currentTime - targetTime) < 0.05) {
    return;
  }
  try {
    state.isSyncingAudioTime = true;
    if (state.audioSeekSyncTimer !== undefined) {
      window.clearTimeout(state.audioSeekSyncTimer);
    }
    dom.bgmAudio.currentTime = Math.max(targetTime, 0);
    state.audioSeekSyncTimer = window.setTimeout(() => {
      state.isSyncingAudioTime = false;
      state.audioSeekSyncTimer = undefined;
    }, 250);
  } catch (error) {
    state.isSyncingAudioTime = false;
    window.console?.warn("[viewer] Failed to seek audio:", error);
  }
}
