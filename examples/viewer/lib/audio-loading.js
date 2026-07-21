import { dom, setLoadedFileSwitcherOptions, setStatus, updateChromeHeights, updatePresetSectionVisibility } from "./dom.js";
import { hasCurrentMotion, state } from "./state.js";

export function loadAudioFile(file) {
  if (!isAudioFile(file)) {
    setStatus("Select a WAV, MP3, or OGG audio file.", "error");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  setAudioSource(objectUrl, { objectUrl });
  updateAudioSwitcher({
    id: `file:${file.name}:${file.lastModified}`,
    name: file.name,
    src: objectUrl,
    source: file
  });
  setStatus("", "ready");
}

export function loadAudioFromUrl(url, label = url.split("/").at(-1) ?? url, options = {}) {
  setAudioSource(url);
  setAudioOffsetFrame(options.offsetFrame ?? 0, { sync: false });
  try {
    updateAudioSwitcher({
      id: `url:${url}`,
      name: decodeURIComponent(label),
      src: url,
      offsetFrame: state.audioOffsetFrame
    });
  } catch {
    updateAudioSwitcher({
      id: `url:${url}`,
      name: label,
      src: url,
      offsetFrame: state.audioOffsetFrame
    });
  }
  setStatus("", "ready");
  return true;
}

export function switchAudioEntry(entry) {
  if (!entry) {
    return;
  }
  setAudioSource(entry.src, { preserveEntries: true });
  setAudioOffsetFrame(entry.offsetFrame ?? 0, { sync: false });
  updateAudioSwitcher(entry);
  setStatus("", "ready");
}

export function setAudioSource(src, options = {}) {
  if (!isAudioElement(dom.bgmAudio)) {
    return;
  }
  clearAudioSource({ preserveEntries: options.preserveEntries });
  dom.bgmAudio.src = src;
  dom.bgmAudio.loop = hasCurrentMotion();
  dom.bgmAudio.load();
  if (options.objectUrl) {
    state.audioObjectUrl = options.objectUrl;
  }
}

export function clearAudioSource(options = {}) {
  if (isAudioElement(dom.bgmAudio)) {
    dom.bgmAudio.pause();
    dom.bgmAudio.removeAttribute("src");
    dom.bgmAudio.load();
  }
  if (state.audioObjectUrl) {
    URL.revokeObjectURL(state.audioObjectUrl);
    state.audioObjectUrl = undefined;
  }
  if (!options.preserveEntries) {
    state.currentAudioEntries = [];
    setAudioOffsetFrame(0, { sync: false });
    updateAudioSwitcher();
  }
}

export function setAudioOffsetFrame(value, options = {}) {
  const frame = parseAudioOffsetFrame(value, options);
  if (frame === undefined) {
    return false;
  }
  state.audioOffsetFrame = frame;
  state.audioOffsetSeconds = frame / state.mmdFrameRate;
  if (options.updateInput !== false) {
    updateAudioOffsetInput();
  }
  if (options.sync !== false) {
    syncAudioToCurrentMotionTime();
  }
  return true;
}

export function isAudioFile(file) {
  return /\.(mp3|ogg|wav)$/i.test(file.name);
}

export function isAudioElement(element) {
  return element instanceof window.HTMLAudioElement;
}

export function hasActiveAudioSource() {
  return (
    isAudioElement(dom.bgmAudio) &&
    state.currentAudioEntries.length > 0 &&
    dom.bgmAudio.currentSrc.length > 0
  );
}

function updateAudioSwitcher(selectedEntry) {
  if (selectedEntry) {
    state.currentAudioEntries = [selectedEntry];
  }
  setLoadedFileSwitcherOptions(
    dom.audioSwitcher,
    state.currentAudioEntries.map((entry) => ({
      value: entry.id,
      label: entry.name
    })),
    selectedEntry?.id
  );
  if (dom.audioControl) {
    dom.audioControl.hidden = state.currentAudioEntries.length === 0;
  }
  if (dom.volumeControl) {
    dom.volumeControl.hidden = state.currentAudioEntries.length === 0;
  }
  updateAudioOffsetInput();
  updatePresetSectionVisibility();
  updateChromeHeights();
}

function parseAudioOffsetFrame(value, options) {
  const numeric = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return options?.fallback === false ? undefined : 0;
}

function updateAudioOffsetInput() {
  if (dom.audioOffsetFrameInput instanceof window.HTMLInputElement) {
    dom.audioOffsetFrameInput.value = String(state.audioOffsetFrame);
  }
}

function syncAudioToCurrentMotionTime() {
  if (!isAudioElement(dom.bgmAudio) || dom.bgmAudio.currentSrc.length === 0) {
    return;
  }
  const duration = Number.isFinite(dom.bgmAudio.duration) ? dom.bgmAudio.duration : undefined;
  const targetTime = state.elapsedSeconds - state.audioOffsetSeconds;
  try {
    dom.bgmAudio.currentTime = clampAudioTime(targetTime, duration);
  } catch (error) {
    window.console?.warn("[viewer] Failed to seek audio after offset update:", error);
  }
}

function clampAudioTime(time, duration) {
  if (duration !== undefined) {
    return Math.min(Math.max(time, 0), Math.max(duration - 0.001, 0));
  }
  return Math.max(time, 0);
}
