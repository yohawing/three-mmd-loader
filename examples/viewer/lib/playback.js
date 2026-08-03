import { dom, setStatus, updatePlayToggle, updatePlaybackDisplay } from "./dom.js";
import { hasActiveAudioSource, isAudioElement } from "./audio-loading.js";
import { applyCameraMotion } from "./camera-loading.js";
import { updateColliderHelpers, updateDebugFps } from "./debug.js";
import {
  beginViewerFrameProfile,
  beginViewerGpuProfile,
  beginViewerStageProfile,
  endViewerFrameProfile,
  endViewerGpuProfile,
  endViewerStageProfile
} from "./performance.js";
import { currentMmdFrame, currentMmdSeconds, hasCurrentMotion, state } from "./state.js";
import { markWorkerRuntimesReady, updateWorkerRuntimeTelemetry } from "./runtime-worker.js";
import { sampleMmdAnimWasmLightTrackInto, sampleMmdLightTrackInto, sampleMmdSelfShadowTrackInto } from "../../../dist/runtime/index.js";
import {
  applyMmdLightStateToThreeDirectionalLight,
  applyMmdSelfShadowStateToThreeDirectionalLight,
  syncMmdSpecularDirection
} from "../../../dist/three/index.js";
import { updateSelfShadowDepthBias, updateShadowCameraForFrame } from "./scene-setup.js";
import {
  isTslViewerPipeline,
  submitViewerRender,
  submitViewerRenderAsync,
  syncMmdTslDedicatedShadowMode,
  syncMmdTslDedicatedShadowVisibility,
  syncViewerTslLight,
  syncCurrentModelTslMaterialStates
} from "./viewer-pipeline.js";

let settledRenderPromise;
let settledRenderPending = false;
let settledRenderPhysics;
let settledRenderIk;
let settledRenderCompileShaders = false;
let settledEvaluationInFlight = 0;

export function render() {
  beginViewerFrameProfile();
  state.frameTimer.update();
  const delta = state.frameTimer.getDelta();
  updateDebugFps(delta);
  if (settledEvaluationInFlight > 0) {
    endViewerFrameProfile(state.renderer);
    return;
  }
  if (state.isPlaying && !state.isSeeking && hasActiveAudioSource()) {
    syncMotionToAudioTime(state.audioNoEvaluateOptionsScratch);
  } else if (state.isPlaying && !state.isSeeking) {
    state.elapsedSeconds += delta;
  }
  let stageStartedAt = beginViewerStageProfile();
  evaluateRuntime();
  updateWorkerRuntimeTelemetry();
  endViewerStageProfile("animation-ik-morph-physics", stageStartedAt);
  stageStartedAt = beginViewerStageProfile();
  updateColliderHelpers();
  state.controls.update();
  applyCameraMotion();
  endViewerStageProfile("shadow-color-outline-sync", stageStartedAt);
  stageStartedAt = beginViewerStageProfile();
  beginViewerGpuProfile(state.renderer);
  try {
    submitViewerRender(true);
  } finally {
    endViewerGpuProfile(state.renderer);
  }
  endViewerStageProfile("render-submit", stageStartedAt);
  endViewerFrameProfile(state.renderer);
}

export function renderStillFrame(options) {
  settledRenderPending = true;
  settledRenderPhysics = options?.physics;
  settledRenderIk = options?.ik;
  settledRenderCompileShaders ||= options?.compileShaders === true;
  if (!settledRenderPromise) {
    settledRenderPromise = drainSettledRenders();
    void settledRenderPromise.catch(reportSettledRenderError);
  }
  return settledRenderPromise;
}

export function evaluateRuntime(options) {
  const seconds = prepareRuntimeEvaluation(options);
  const updateOptions = state.runtimeUpdateOptionsScratch;
  const models = state.characterModels;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    if (model?.runtime) {
      model.update(seconds, updateOptions);
    }
  }
  finishRuntimeEvaluation();
}

async function drainSettledRenders() {
  try {
    while (settledRenderPending) {
      settledRenderPending = false;
      const options = {
        physics: settledRenderPhysics,
        ik: settledRenderIk,
        compileShaders: settledRenderCompileShaders
      };
      settledRenderCompileShaders = false;
      try {
        await renderSettledFrame(options);
      } catch (error) {
        // A model replacement can invalidate the active request while already
        // queuing the replacement's render. Let that latest request settle;
        // an unsuperseded failure still rejects the shared drain promise.
        if (!settledRenderPending) {
          throw error;
        }
      }
    }
  } finally {
    settledRenderPending = false;
    settledRenderPhysics = undefined;
    settledRenderIk = undefined;
    settledRenderCompileShaders = false;
    settledRenderPromise = undefined;
  }
}

async function renderSettledFrame(options) {
  state.selfShadowBoundsRefreshCountdown = 0;
  const targetSeconds = prepareRuntimeEvaluation(options);
  const updateOptions = state.runtimeUpdateOptionsScratch;
  const updates = [];
  const models = state.characterModels;
  settledEvaluationInFlight += 1;
  try {
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      if (model?.runtime) {
        updates.push(model.updateAsync(targetSeconds, updateOptions));
      }
    }
    await Promise.all(updates);
    markWorkerRuntimesReady();
    const resumeSeconds = state.elapsedSeconds;
    state.elapsedSeconds = targetSeconds;
    try {
      finishRuntimeEvaluation();
      updateColliderHelpers();
      state.controls.update();
      applyCameraMotion();
      if (options.compileShaders && isTslViewerPipeline()) {
        await submitViewerRenderAsync();
      } else {
        submitViewerRender();
      }
    } finally {
      state.elapsedSeconds = resumeSeconds;
    }
  } finally {
    settledEvaluationInFlight -= 1;
  }
}

function prepareRuntimeEvaluation(options) {
  const maxTime = Number(dom.timeline?.max ?? 10);
  if (state.elapsedSeconds > maxTime && maxTime > 0) {
    state.elapsedSeconds %= maxTime;
    syncAudioToMotionTime();
  }
  const updateOptions = state.runtimeUpdateOptionsScratch;
  updateOptions.ik = options?.ik ?? hasCurrentMotion();
  // Let the backend seed external physics from the assigned motion at frame 0;
  // its reset/seek path is seed-only, so Bullet advances on the next RAF.
  updateOptions.physics =
    state.physicsEnabled &&
    (options?.physics ?? (!state.isSeeking && (state.elapsedSeconds > 0 || hasCurrentMotion())));
  return currentMmdSeconds();
}

function finishRuntimeEvaluation() {
  if (state.currentModel?.mesh) {
    updateShadowCameraForFrame(state.currentModel.mesh);
  }
  syncCurrentModelTslMaterialStates();
  applyLightMotion();
  applySelfShadowMotion();
  if (dom.timeline) {
    dom.timeline.value = state.elapsedSeconds;
  }
  updatePlaybackDisplay();
}

function reportSettledRenderError(error) {
  if (error?.name === "AbortError") {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  window.console?.error("[viewer] Settled render failed:", error);
  setStatus(message, "error");
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
    for (let index = 1; index < state.characterModels.length; index += 1) {
      const material = state.characterModels[index]?.mesh?.material;
      if (material) {
        syncMmdSpecularDirection(material, state.keyLight);
      }
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
    syncMmdTslDedicatedShadowMode(1);
    updateSelfShadowDepthBias();
    syncMmdTslDedicatedShadowVisibility();
    return;
  }
  const frames = state.currentMotion?.animation?.selfShadowFrames;
  if (!frames || frames.length === 0) {
    state.keyLight.castShadow = true;
    syncMmdTslDedicatedShadowMode(1);
    state.selfShadowFrameHint.index = 0;
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
  applyMmdSelfShadowStateToThreeDirectionalLight(
    state.keyLight,
    selfShadowState,
    state.selfShadowLightOptionsScratch
  );
  syncMmdTslDedicatedShadowMode(selfShadowState.mode);
  updateSelfShadowDepthBias();
  syncMmdTslDedicatedShadowVisibility();
}

export async function setPlaybackPlaying(playing) {
  setPlaybackState(playing);
  if (!isAudioElement(dom.bgmAudio) || !hasActiveAudioSource()) {
    return;
  }
  state.isSyncingAudioState = true;
  try {
    if (playing) {
      syncAudioToMotionTime(state.audioDriftSyncOptionsScratch);
      await dom.bgmAudio.play();
    } else {
      syncMotionToAudioTime(state.audioNoEvaluateOptionsScratch);
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
  syncMotionToAudioTime(state.audioNoEvaluateOptionsScratch);
}

export function syncMotionToAudioTime(options) {
  if (!isAudioElement(dom.bgmAudio) || !hasTimelineSource()) {
    return;
  }
  if (state.isSyncingAudioTime) {
    return;
  }
  if (settledEvaluationInFlight > 0) {
    return;
  }
  const audioTime = Number.isFinite(dom.bgmAudio.currentTime) ? dom.bgmAudio.currentTime : 0;
  state.elapsedSeconds = Math.max(audioTime + state.audioOffsetSeconds, 0);
  if (options?.evaluate !== false) {
    const evaluateOptions = state.runtimePhysicsDisabledOptionsScratch;
    evaluateOptions.physics = options?.physics ?? false;
    evaluateRuntime(evaluateOptions);
  }
}

function hasTimelineSource() {
  return hasCurrentMotion() || state.currentCameraMotion !== undefined;
}

export function syncAudioToMotionTime(options) {
  const active = hasActiveAudioSource();
  if (!isAudioElement(dom.bgmAudio) || !active) {
    return;
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

export function finishAudioTimeSync() {
  if (!state.isSyncingAudioTime) {
    return false;
  }
  state.isSyncingAudioTime = false;
  if (state.audioSeekSyncTimer !== undefined) {
    window.clearTimeout(state.audioSeekSyncTimer);
    state.audioSeekSyncTimer = undefined;
  }
  return true;
}
