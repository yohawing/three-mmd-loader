import { dom, setDisplayedText, setStatus } from "./dom.js";
import { hasCurrentMotion, state } from "./state.js";

export function loadAudioFile(file) {
  if (!isAudioFile(file)) {
    setStatus("Select a WAV, MP3, or OGG audio file.", "error");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  setAudioSource(objectUrl, { objectUrl });
  setDisplayedText(dom.audioNameText, file.name);
  setStatus("", "ready");
}

export function setAudioSource(src, options = {}) {
  if (!isAudioElement(dom.bgmAudio)) {
    return;
  }
  clearAudioSource();
  dom.bgmAudio.src = src;
  dom.bgmAudio.loop = hasCurrentMotion();
  dom.bgmAudio.load();
  if (options.objectUrl) {
    state.audioObjectUrl = options.objectUrl;
  }
}

export function clearAudioSource() {
  if (isAudioElement(dom.bgmAudio)) {
    dom.bgmAudio.pause();
    dom.bgmAudio.removeAttribute("src");
    dom.bgmAudio.load();
  }
  if (state.audioObjectUrl) {
    URL.revokeObjectURL(state.audioObjectUrl);
    state.audioObjectUrl = undefined;
  }
  setDisplayedText(dom.audioNameText, "");
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
