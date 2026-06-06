import { dom, setStatus, updatePlayToggle, updatePlaybackDisplay } from "./dom.js";
import { hasActiveAudioSource, isAudioElement } from "./audio-loading.js";
import { applyCameraMotion } from "./camera-loading.js";
import { updateColliderHelpers, updateDebugFps } from "./debug.js";
import { currentMmdFrame, currentMmdSeconds, hasCurrentMotion, state } from "./state.js";
import { sampleMmdSelfShadowTrackInto } from "../../../dist/runtime/index.js";
import {
  applyMmdSelfShadowStateToThreeDirectionalLight,
  syncMmdSpecularDirection
} from "../../../dist/three/index.js";
import { fitShadowCameraToObject } from "./scene-setup.js";

export function render() {
  state.frameTimer.update();
  const delta = state.frameTimer.getDelta();
  updateDebugFps(delta);
  if (state.isPlaying && !state.isSeeking && hasActiveAudioSource()) {
    syncMotionToAudioTime(state.audioNoEvaluateOptionsScratch);
  } else if (state.isPlaying && !state.isSeeking) {
    state.elapsedSeconds += delta;
  }
  evaluateRuntime();
  updateColliderHelpers();
  state.controls.update();
  applyCameraMotion();
  state.renderer.render(state.scene, state.camera);
}

export function renderStillFrame() {
  evaluateRuntime();
  updateColliderHelpers();
  state.controls.update();
  applyCameraMotion();
  state.renderer.render(state.scene, state.camera);
}

export function evaluateRuntime(options) {
  const maxTime = Number(dom.timeline?.max ?? 10);
  if (state.elapsedSeconds > maxTime && maxTime > 0) {
    state.elapsedSeconds %= maxTime;
    syncAudioToMotionTime();
  }
  if (state.currentModel?.runtime) {
    const updateOptions = state.runtimeUpdateOptionsScratch;
    updateOptions.ik = options?.ik ?? hasCurrentMotion();
    updateOptions.physics =
      state.physicsEnabled && (options?.physics ?? (!state.isSeeking && state.elapsedSeconds > 0));
    state.currentModel.update(currentMmdSeconds(), updateOptions);
  }
  applyLightMotion();
  if (state.currentModel?.mesh) {
    fitShadowCameraToObject(state.currentModel.mesh);
  }
  applySelfShadowMotion();
  if (dom.timeline) {
    dom.timeline.value = state.elapsedSeconds;
  }
  updatePlaybackDisplay();
}

function applyLightMotion() {
  const lightState = state.currentModel?.runtime?.lightState?.();
  if (!lightState || !state.keyLight) {
    return;
  }
  state.keyLight.color.setRGB(lightState.color[0], lightState.color[1], lightState.color[2]);
  const direction = state.lightDirectionScratch.set(
    lightState.direction[0],
    lightState.direction[1],
    -lightState.direction[2]
  );
  if (direction.lengthSq() > 0) {
    direction.normalize();
    const target = state.controls.target;
    state.keyLight.target.position.copy(target);
    state.keyLight.position.copy(target).addScaledVector(direction, 5);
    state.keyLight.target.updateMatrixWorld();
    state.keyLight.updateMatrixWorld();
  }
  if (state.currentModel?.mesh?.material) {
    syncMmdSpecularDirection(state.currentModel.mesh.material, state.keyLight);
  }
  if (state.currentBackground?.mesh?.material) {
    syncMmdSpecularDirection(state.currentBackground.mesh.material, state.keyLight);
  }
}

function applySelfShadowMotion() {
  if (!state.keyLight) {
    return;
  }
  if (!state.debugSelfShadowEnabled) {
    state.keyLight.castShadow = false;
    return;
  }
  const frames = state.currentMotion?.animation?.selfShadowFrames;
  if (!frames || frames.length === 0) {
    state.keyLight.castShadow = true;
    state.selfShadowFrameHint.index = 0;
    return;
  }
  const selfShadowState = sampleMmdSelfShadowTrackInto(
    frames,
    currentMmdFrame(),
    state.selfShadowStateScratch,
    state.selfShadowFrameHint
  );
  applyMmdSelfShadowStateToThreeDirectionalLight(
    state.keyLight,
    selfShadowState,
    state.selfShadowLightOptionsScratch
  );
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
