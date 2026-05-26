import { dom, setStatus } from "./dom.js";
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
    src: objectUrl
  });
  setStatus("", "ready");
}

export function loadAudioFromUrl(url, label = url.split("/").at(-1) ?? url) {
  setAudioSource(url);
  try {
    updateAudioSwitcher({
      id: `url:${url}`,
      name: decodeURIComponent(label),
      src: url
    });
  } catch {
    updateAudioSwitcher({
      id: `url:${url}`,
      name: label,
      src: url
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
    updateAudioSwitcher();
  }
}

export function isAudioFile(file) {
  return /\.(mp3|ogg|wav)$/i.test(file.name);
}

export function isAudioElement(element) {
  return element instanceof window.HTMLAudioElement;
}

export function hasActiveAudioSource() {
  return isAudioElement(dom.bgmAudio) && dom.bgmAudio.currentSrc.length > 0;
}

function updateAudioSwitcher(selectedEntry) {
  if (!(dom.audioSwitcher instanceof window.HTMLSelectElement)) {
    return;
  }
  if (selectedEntry) {
    state.currentAudioEntries = [selectedEntry];
  }
  dom.audioSwitcher.replaceChildren(
    ...state.currentAudioEntries.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      return option;
    })
  );
  if (selectedEntry) {
    dom.audioSwitcher.value = selectedEntry.id;
  }
  if (dom.audioControl) {
    dom.audioControl.hidden = state.currentAudioEntries.length === 0;
  }
}
