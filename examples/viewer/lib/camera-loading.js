import { parseVmd } from "../../../dist/parser/index.js";

import { dom, setStatus, updatePlaybackDisplay, updateTransportState } from "./dom.js";
import { currentMotionDurationSeconds, hasCurrentMotion } from "./state.js";
import { state } from "./state.js";
import { labelFromUrl } from "./url-label.js";

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch " + url + ": " + response.status);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadCameraFromUrl(url) {
  try {
    setStatus(`Loading camera: ${labelFromUrl(url)}`, "loading");
    const animation = parseVmd(await fetchBytes(url));
    return await loadCameraAnimation(animation, labelFromUrl(url), {
      id: `url:${url}`,
      name: labelFromUrl(url),
      source: url
    });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    return false;
  }
}

export async function loadCameraFile(file) {
  try {
    setStatus(`Loading camera: ${file.name}`, "loading");
    const animation = parseVmd(new Uint8Array(await file.arrayBuffer()));
    await loadCameraAnimation(animation, file.name, {
      id: `file:${file.name}:${file.lastModified}`,
      name: file.name,
      source: file
    });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

export async function switchCameraEntry(entry) {
  if (!entry) {
    return;
  }
  if (typeof entry.source === "string") {
    await loadCameraFromUrl(entry.source);
    return;
  }
  await loadCameraFile(entry.source);
}

export function clearCameraMotion() {
  state.currentCameraMotion = undefined;
  state.currentCameraEntries = [];
  updateCameraSwitcher();
  syncTimelineRangeToCurrentMotion();
  updateTransportState();
}

export function applyCameraMotion() {
  const cameraMotion = state.currentCameraMotion;
  if (!cameraMotion || cameraMotion.frames.length === 0) {
    return;
  }
  const frameNumber = state.elapsedSeconds * 30;
  const frames = cameraMotion.frames;
  let previous;
  let next;
  let t;
  if (frameNumber <= frames[0].frame) {
    cameraMotion.frameIndex = 0;
    previous = frames[0];
    next = frames[0];
    t = 0;
  } else {
    if (cameraMotion.frameIndex >= frames.length || frames[cameraMotion.frameIndex].frame > frameNumber) {
      cameraMotion.frameIndex = 0;
    }
    while (
      cameraMotion.frameIndex + 1 < frames.length &&
      frames[cameraMotion.frameIndex + 1].frame <= frameNumber
    ) {
      cameraMotion.frameIndex += 1;
    }
    previous = frames[cameraMotion.frameIndex];
    next = frames[cameraMotion.frameIndex + 1] ?? previous;
    t = previous === next ? 0 : (frameNumber - previous.frame) / Math.max(next.frame - previous.frame, 1);
  }
  const interpolation = next.interpolation;
  const target = state.cameraTargetScratch;
  const offset = state.cameraOffsetScratch;
  const euler = state.cameraEulerScratch;
  const distance = lerp(previous.distance, next.distance, interpolateBezier(interpolation?.distance, t));
  target.set(
    lerp(previous.position[0], next.position[0], interpolateBezier(interpolation?.positionX, t)),
    lerp(previous.position[1], next.position[1], interpolateBezier(interpolation?.positionY, t)),
    -lerp(previous.position[2], next.position[2], interpolateBezier(interpolation?.positionZ, t))
  );
  const rotationT = interpolateBezier(interpolation?.rotation, t);
  euler.set(
    -lerp(previous.rotation[0], next.rotation[0], rotationT),
    -lerp(previous.rotation[1], next.rotation[1], rotationT),
    lerp(previous.rotation[2], next.rotation[2], rotationT),
    "YXZ"
  );
  offset.set(0, 0, -distance).applyEuler(euler);
  state.camera.position.copy(target).add(offset);
  state.camera.lookAt(target);
  state.camera.fov = Math.max(lerp(previous.fov, next.fov, interpolateBezier(interpolation?.fov, t)), 1);
  state.camera.updateProjectionMatrix();
}

async function loadCameraAnimation(animation, label, entry) {
  if (animation.cameraFrames.length === 0) {
    setStatus("Selected VMD has no camera frames.", "error");
    return false;
  }
  state.currentCameraMotion = {
    name: label,
    frames: animation.cameraFrames,
    durationSeconds: Math.max((animation.metadata?.maxFrame ?? 0) / 30, 0),
    frameIndex: 0
  };
  updateCameraSwitcher({
    ...entry,
    name: label
  });
  if (dom.timeline) {
    syncTimelineRangeToCurrentMotion();
    if (!hasCurrentMotion()) {
      state.elapsedSeconds = 0;
      dom.timeline.value = "0";
    }
    updatePlaybackDisplay();
  }
  updateTransportState();
  applyCameraMotion();
  setStatus("", "ready");
  state.controls.update();
  state.renderer.render(state.scene, state.camera);
  return true;
}

function syncTimelineRangeToCurrentMotion() {
  if (!dom.timeline) {
    return;
  }
  const maxTime = Math.max(currentMotionDurationSeconds(), 0.001);
  dom.timeline.max = String(maxTime);
  if (state.elapsedSeconds > maxTime) {
    state.elapsedSeconds = Math.max(maxTime - 0.001, 0);
    dom.timeline.value = String(state.elapsedSeconds);
  }
  updatePlaybackDisplay();
}

function updateCameraSwitcher(selectedEntry) {
  if (!(dom.cameraSwitcher instanceof window.HTMLSelectElement)) {
    return;
  }
  if (selectedEntry) {
    state.currentCameraEntries = [selectedEntry];
  }
  dom.cameraSwitcher.replaceChildren(
    ...state.currentCameraEntries.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      return option;
    })
  );
  if (selectedEntry) {
    dom.cameraSwitcher.value = selectedEntry.id;
  }
  if (dom.cameraControl) {
    dom.cameraControl.hidden = state.currentCameraEntries.length === 0;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function interpolateBezier(curve, x) {
  if (!curve) {
    return x;
  }
  const x1 = curve[0];
  const y1 = curve[1];
  const x2 = curve[2];
  const y2 = curve[3];
  if (Math.abs(x1 - y1) < 1e-6 && Math.abs(x2 - y2) < 1e-6) {
    return x;
  }
  let lower = 0;
  let upper = 1;
  let t = x;
  for (let i = 0; i < 16; i += 1) {
    const sampledX = cubicBezier(t, x1, x2);
    if (Math.abs(sampledX - x) < 1e-5) {
      break;
    }
    if (sampledX < x) {
      lower = t;
    } else {
      upper = t;
    }
    t = (lower + upper) / 2;
  }
  return cubicBezier(t, y1, y2);
}

function cubicBezier(t, p1, p2) {
  const inv = 1 - t;
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t;
}
