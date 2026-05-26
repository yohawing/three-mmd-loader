import { loadAudioFromUrl } from "./audio-loading.js";
import { loadBackgroundFromUrl } from "./background-loading.js";
import { loadCameraFromUrl } from "./camera-loading.js";
import { loadModelFromUrl } from "./model-loading.js";
import { loadMotionFromUrl } from "./motion-loading.js";
import { labelFromUrl } from "./url-label.js";
import { dom, setStatus, updateChromeHeights } from "./dom.js";
import { state } from "./state.js";

const localAssetsUrl = "/__mmd_assets__/fixtures-local.json";
const recentStorageKey = "three-mmd-loader.viewer.recentAssets.v2";
const legacyRecentStorageKey = "three-mmd-loader.viewer.recentAssets.v1";
const selectionStorageKey = "three-mmd-loader.viewer.assetSelection.v1";
const customPresetStorageKey = "three-mmd-loader.viewer.customPresets.v1";
const recentLimit = 12;

const assetCategories = {
  models: {
    select: () => dom.assetModelSelect,
    button: () => dom.assetModelLoadButton,
    recentSelect: () => dom.recentModelSelect,
    recentButton: () => dom.recentModelLoadButton,
    load: (asset) => loadModelFromUrl(asset.url)
  },
  motions: {
    select: () => dom.assetMotionSelect,
    button: () => dom.assetMotionLoadButton,
    recentSelect: () => dom.recentMotionSelect,
    recentButton: () => dom.recentMotionLoadButton,
    load: (asset) => loadMotionFromUrl(asset.url)
  },
  backgrounds: {
    select: () => dom.assetBackgroundSelect,
    button: () => dom.assetBackgroundLoadButton,
    recentSelect: () => dom.recentBackgroundSelect,
    recentButton: () => dom.recentBackgroundLoadButton,
    load: (asset) => loadBackgroundFromUrl(asset.url)
  },
  audios: {
    select: () => dom.assetAudioSelect,
    button: () => dom.assetAudioLoadButton,
    recentSelect: () => dom.recentAudioSelect,
    recentButton: () => dom.recentAudioLoadButton,
    load: (asset) => loadAudioFromUrl(asset.url, labelFromUrl(asset.url))
  },
  cameras: {
    select: () => dom.assetCameraSelect,
    button: () => dom.assetCameraLoadButton,
    recentSelect: () => dom.recentCameraSelect,
    recentButton: () => dom.recentCameraLoadButton,
    load: (asset) => loadCameraFromUrl(asset.url)
  }
};

export async function initializeAssetLibrary() {
  const [manifest, recentAssets, customPresets] = await Promise.all([
    fetchLocalAssetManifest(),
    Promise.resolve(readRecentAssets()),
    Promise.resolve(readCustomPresets())
  ]);

  state.assetLibrary = {
    presets: [...(manifest?.presets ?? []), ...customPresets],
    models: manifest?.models ?? [],
    motions: manifest?.motions ?? [],
    poses: manifest?.poses ?? [],
    backgrounds: manifest?.backgrounds ?? [],
    audios: manifest?.audios ?? [],
    cameras: manifest?.cameras ?? [],
    recent: recentAssets
  };

  updateAssetLibraryControls();
  restoreSavedSelection(readSavedSelection());
}

export function bindAssetLibraryControls() {
  dom.assetPresetLoadButton?.addEventListener("click", () => {
    const preset = findSelectedAsset(state.assetLibrary.presets, dom.assetPresetSelect);
    if (preset) void loadAssetPreset(preset);
  });
  dom.assetPresetSaveButton?.addEventListener("click", saveCurrentAssetPreset);
  for (const [category, config] of Object.entries(assetCategories)) {
    config.button()?.addEventListener("click", () => {
      const asset = findSelectedAsset(state.assetLibrary[category], config.select());
      if (asset) void loadCategoryAsset(category, asset);
    });
    config.recentButton()?.addEventListener("click", () => {
      const asset = findSelectedAsset(state.assetLibrary.recent[category], config.recentSelect());
      if (asset) void loadCategoryAsset(category, asset);
    });
  }
}

async function fetchLocalAssetManifest() {
  try {
    const response = await fetch(localAssetsUrl, { cache: "no-store" });
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch local assets: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    window.console?.warn("[mmd-viewer] local asset manifest unavailable", error);
    return undefined;
  }
}

async function loadAssetPreset(preset) {
  setStatus(`Loading preset: ${preset.name}`, "loading");
  if (preset.modelUrl && !await loadModelFromUrl(preset.modelUrl)) {
    return;
  }
  if (preset.motionUrl && !await loadMotionFromUrl(preset.motionUrl)) {
    return;
  }
  if (preset.backgroundUrl && !await loadBackgroundFromUrl(preset.backgroundUrl)) {
    return;
  }
  if (preset.audioUrl) {
    if (!loadAudioFromUrl(preset.audioUrl, labelFromUrl(preset.audioUrl))) {
      return;
    }
  }
  if (preset.cameraUrl && !await loadCameraFromUrl(preset.cameraUrl)) {
    return;
  }
  setStatus("", "ready");
}

function saveCurrentAssetPreset() {
  const preset = createCurrentAssetPreset();
  if (!preset) {
    setStatus("Load at least one URL-backed asset before saving a preset.", "error");
    return;
  }
  const name = window.prompt("Preset name", preset.name);
  if (name === null) {
    return;
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    setStatus("Preset name is required.", "error");
    return;
  }
  const savedPreset = {
    ...preset,
    id: `custom:${Date.now().toString(36)}`,
    name: trimmedName
  };
  const customPresets = [
    savedPreset,
    ...readCustomPresets().filter((entry) => entry.name !== trimmedName)
  ];
  writeCustomPresets(customPresets);
  state.assetLibrary.presets = [
    ...state.assetLibrary.presets.filter((entry) => !isCustomPreset(entry)),
    ...customPresets
  ];
  updatePresetControls();
  setSelectValue(dom.assetPresetSelect, savedPreset.id);
  setStatus(`Saved preset: ${trimmedName}`, "ready");
}

async function loadCategoryAsset(category, asset) {
  const config = assetCategories[category];
  if (!config) {
    return;
  }
  saveSelectedAssetSelection();
  setStatus(`Loading ${asset.name}`, "loading");
  if (!await config.load(asset)) {
    return;
  }
  rememberRecentAsset(category, asset);
  setStatus("", "ready");
}

function updateAssetLibraryControls() {
  updatePresetControls();
  for (const [category, config] of Object.entries(assetCategories)) {
    updateSelect(config.select(), state.assetLibrary[category]);
    updateSelect(config.recentSelect(), state.assetLibrary.recent[category]);
    setButtonHidden(config.button(), state.assetLibrary[category].length === 0);
    setButtonHidden(config.recentButton(), state.assetLibrary.recent[category].length === 0);
  }
  updateChromeHeights();
}

function updatePresetControls() {
  updateSelect(dom.assetPresetSelect, state.assetLibrary.presets);
  setButtonHidden(dom.assetPresetLoadButton, state.assetLibrary.presets.length === 0);
  if (dom.assetPresetSection) {
    dom.assetPresetSection.hidden = false;
  }
}

function updateSelect(select, assets) {
  if (!(select instanceof window.HTMLSelectElement)) {
    return;
  }
  const previousValue = select.value;
  select.replaceChildren(
    ...assets.map((asset) => {
      const option = document.createElement("option");
      option.value = asset.id;
      option.textContent = asset.name;
      return option;
    })
  );
  if (assets.some((asset) => asset.id === previousValue)) {
    select.value = previousValue;
  } else if (assets[0]) {
    select.value = assets[0].id;
  }
  select.hidden = assets.length === 0;
  const row = select.closest(".asset-load-row");
  if (row instanceof window.HTMLElement) {
    row.hidden = assets.length === 0;
  }
}

function restoreSavedSelection(selection) {
  if (selection === undefined) {
    return;
  }
  setSelectValue(dom.assetModelSelect, selection.models);
  setSelectValue(dom.assetMotionSelect, selection.motions);
  setSelectValue(dom.assetBackgroundSelect, selection.backgrounds);
  setSelectValue(dom.assetAudioSelect, selection.audios);
  setSelectValue(dom.assetCameraSelect, selection.cameras);
}

function saveSelectedAssetSelection() {
  const selection = {
    models: selectionValue(dom.assetModelSelect),
    motions: selectionValue(dom.assetMotionSelect),
    backgrounds: selectionValue(dom.assetBackgroundSelect),
    audios: selectionValue(dom.assetAudioSelect),
    cameras: selectionValue(dom.assetCameraSelect)
  };
  window.localStorage.setItem(selectionStorageKey, JSON.stringify(selection));
}

function readSavedSelection() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(selectionStorageKey) ?? "null");
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return {
      models: parsed.models ?? parsed.model,
      motions: parsed.motions ?? parsed.motion,
      backgrounds: parsed.backgrounds ?? parsed.background,
      audios: parsed.audios ?? parsed.audio,
      cameras: parsed.cameras ?? parsed.camera
    };
  } catch {
    return undefined;
  }
}

function selectionValue(select) {
  if (!(select instanceof window.HTMLSelectElement) || select.hidden) {
    return undefined;
  }
  return select.value;
}

function setSelectValue(select, value) {
  if (!(select instanceof window.HTMLSelectElement) || typeof value !== "string") {
    return;
  }
  if (Array.from(select.options).some((option) => option.value === value)) {
    select.value = value;
  }
}

function setButtonHidden(button, hidden) {
  if (button instanceof window.HTMLButtonElement) {
    button.hidden = hidden;
  }
}

function findSelectedAsset(assets, select) {
  if (!(select instanceof window.HTMLSelectElement)) {
    return undefined;
  }
  return assets.find((asset) => asset.id === select.value);
}

function createCurrentAssetPreset() {
  const modelUrl = currentModelUrl();
  const motionUrl = currentMotionUrl();
  const backgroundUrl = selectedEntryUrl(state.currentBackgroundEntries, dom.backgroundSwitcher);
  const audioUrl = selectedEntryUrl(state.currentAudioEntries, dom.audioSwitcher);
  const cameraUrl = selectedEntryUrl(state.currentCameraEntries, dom.cameraSwitcher);
  if (!modelUrl && !motionUrl && !backgroundUrl && !audioUrl && !cameraUrl) {
    return undefined;
  }
  return {
    id: "custom:current",
    name: defaultPresetName(modelUrl, motionUrl),
    ...(modelUrl ? { modelUrl } : {}),
    ...(motionUrl ? { motionUrl } : {}),
    ...(backgroundUrl ? { backgroundUrl } : {}),
    ...(audioUrl ? { audioUrl } : {}),
    ...(cameraUrl ? { cameraUrl } : {})
  };
}

function currentModelUrl() {
  const entry = selectedEntry(state.currentFolderPmxFiles, dom.modelSwitcher);
  return typeof entry?.source === "string" ? entry.source : undefined;
}

function currentMotionUrl() {
  return typeof state.currentMotion?.source === "string"
    ? state.currentMotion.source
    : typeof state.pendingMotionSource === "string"
      ? state.pendingMotionSource
      : undefined;
}

function selectedEntryUrl(entries, select) {
  const entry = selectedEntry(entries, select);
  const url = entry?.source ?? entry?.src;
  return typeof url === "string" && !url.startsWith("blob:") ? url : undefined;
}

function selectedEntry(entries, select) {
  if (!(select instanceof window.HTMLSelectElement)) {
    return entries[0];
  }
  return entries.find((entry) => entry.id === select.value) ?? entries[0];
}

function defaultPresetName(modelUrl, motionUrl) {
  return modelUrl ? labelFromUrl(modelUrl) : motionUrl ? labelFromUrl(motionUrl) : "Current preset";
}

function isCustomPreset(preset) {
  return typeof preset?.id === "string" && preset.id.startsWith("custom:");
}

function readCustomPresets() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(customPresetStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isCustomPresetAsset);
  } catch {
    return [];
  }
}

function writeCustomPresets(presets) {
  window.localStorage.setItem(customPresetStorageKey, JSON.stringify(presets.filter(isCustomPresetAsset)));
}

function isCustomPresetAsset(preset) {
  return preset && typeof preset.id === "string" && typeof preset.name === "string" && (
    typeof preset.modelUrl === "string" ||
    typeof preset.motionUrl === "string" ||
    typeof preset.backgroundUrl === "string" ||
    typeof preset.audioUrl === "string" ||
    typeof preset.cameraUrl === "string"
  );
}

function rememberRecentAsset(category, asset) {
  const existing = state.assetLibrary.recent[category] ?? [];
  state.assetLibrary.recent[category] = [
    {
      id: asset.id,
      name: asset.name,
      url: asset.url
    },
    ...existing.filter((entry) => entry.id !== asset.id)
  ].slice(0, recentLimit);
  window.localStorage.setItem(recentStorageKey, JSON.stringify(state.assetLibrary.recent));
  updateAssetLibraryControls();
}

function readRecentAssets() {
  const empty = createEmptyRecentAssets();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentStorageKey) ?? "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return normalizeRecentAssets(parsed);
    }
    return migrateLegacyRecentAssets(empty);
  } catch {
    return migrateLegacyRecentAssets(empty);
  }
}

function migrateLegacyRecentAssets(fallback) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(legacyRecentStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    const recent = createEmptyRecentAssets();
    for (const entry of parsed) {
      addLegacyRecentEntry(recent.models, entry, "modelUrl");
      addLegacyRecentEntry(recent.motions, entry, "motionUrl");
      addLegacyRecentEntry(recent.backgrounds, entry, "backgroundUrl");
      addLegacyRecentEntry(recent.audios, entry, "audioUrl");
      addLegacyRecentEntry(recent.cameras, entry, "cameraUrl");
    }
    return recent;
  } catch {
    return fallback;
  }
}

function addLegacyRecentEntry(target, entry, urlKey) {
  if (!entry || typeof entry[urlKey] !== "string") {
    return;
  }
  const url = entry[urlKey];
  target.push({
    id: `${urlKey}:${url}`,
    name: labelFromUrl(url),
    url
  });
}

function normalizeRecentAssets(value) {
  const recent = createEmptyRecentAssets();
  for (const category of Object.keys(assetCategories)) {
    if (Array.isArray(value[category])) {
      recent[category] = value[category].filter(isRecentAsset).slice(0, recentLimit);
    }
  }
  return recent;
}

function createEmptyRecentAssets() {
  return {
    models: [],
    motions: [],
    backgrounds: [],
    audios: [],
    cameras: []
  };
}

function isRecentAsset(asset) {
  return asset && typeof asset.id === "string" && typeof asset.name === "string" && typeof asset.url === "string";
}
