import { dom, setStatus, updatePlayToggle, updatePlaybackDisplay } from "./dom.js";
import { hasActiveAudioSource, isAudioElement } from "./audio-loading.js";
import { applyCameraMotion } from "./camera-loading.js";
import { updateColliderHelpers } from "./debug.js";
import { currentMmdFrame, currentMmdSeconds, hasCurrentMotion, state } from "./state.js";
import { sampleMmdSelfShadowTrackInto } from "../../../dist/runtime/index.js";
import { applyMmdSelfShadowStateToThreeDirectionalLight } from "../../../dist/three/index.js";
import { fitShadowCameraToObject } from "./scene-setup.js";

export function render() {
  state.frameTimer.update();
  const delta = state.frameTimer.getDelta();
  if (state.isPlaying && !state.isSeeking && hasActiveAudioSource()) {
    syncMotionToAudioTime({ evaluate: false });
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

export function evaluateRuntime(options = {}) {
  const maxTime = Number(dom.timeline?.max ?? 10);
  if (state.elapsedSeconds > maxTime && maxTime > 0) {
    state.elapsedSeconds %= maxTime;
    syncAudioToMotionTime();
  }
  if (state.currentModel?.runtime) {
    state.currentModel.runtime.tick(currentMmdSeconds(), {
      mesh: state.currentModel.mesh,
      ik: options.ik ?? hasCurrentMotion(),
      physics: options.physics ?? (!state.isSeeking && state.elapsedSeconds > 0)
    });
  }
  if (state.currentModel?.mesh) {
    fitShadowCameraToObject(state.currentModel.mesh);
  }
  applySelfShadowMotion();
  if (dom.timeline) {
    dom.timeline.value = state.elapsedSeconds;
  }
  updatePlaybackDisplay();
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
  applyMmdSelfShadowStateToThreeDirectionalLight(state.keyLight, selfShadowState, {
    distanceScale: 100,
    minFar: 1,
    maxFar: 100,
    shadowIntensity: 1.0
  });
}

export async function setPlaybackPlaying(playing) {
  setPlaybackState(playing);
  if (!isAudioElement(dom.bgmAudio) || !hasActiveAudioSource()) {
    return;
  }
  state.isSyncingAudioState = true;
  try {
    if (playing) {
      syncAudioToMotionTime({ onlyIfDrifted: true });
      await dom.bgmAudio.play();
    } else {
      syncMotionToAudioTime({ evaluate: false });
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
  syncMotionToAudioTime({ evaluate: false });
}

export function syncMotionToAudioTime(options = {}) {
  if (!isAudioElement(dom.bgmAudio) || !hasTimelineSource()) {
    return;
  }
  if (state.isSyncingAudioTime) {
    return;
  }
  const audioTime = Number.isFinite(dom.bgmAudio.currentTime) ? dom.bgmAudio.currentTime : 0;
  state.elapsedSeconds = audioTime;
  if (options.evaluate !== false) {
    evaluateRuntime({ physics: options.physics ?? false });
  }
}

function hasTimelineSource() {
  return hasCurrentMotion() || state.currentCameraMotion !== undefined;
}

export function syncAudioToMotionTime(options = {}) {
  const active = hasActiveAudioSource();
  if (!isAudioElement(dom.bgmAudio) || !active) {
    return;
  }
  const duration = Number.isFinite(dom.bgmAudio.duration) ? dom.bgmAudio.duration : undefined;
  const targetTime = duration ? Math.min(state.elapsedSeconds, Math.max(duration - 0.001, 0)) : state.elapsedSeconds;
  if (options.onlyIfDrifted && Math.abs(dom.bgmAudio.currentTime - targetTime) < 0.05) {
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
