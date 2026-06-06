import { loadAudioFromUrl } from "./audio-loading.js";
import { loadBackgroundFromUrl } from "./background-loading.js";
import { loadCameraFromUrl } from "./camera-loading.js";
import { loadModelFromUrl } from "./model-loading.js";
import { loadMotionFromUrl } from "./motion-loading.js";
import { labelFromUrl } from "./url-label.js";
import { dom, removeFixtureUi, setStatus, updateChromeHeights, updatePresetSectionVisibility } from "./dom.js";
import { state } from "./state.js";

const localAssetsUrl = "/__mmd_assets__/fixtures-local.json";
const selectionStorageKey = "three-mmd-loader.viewer.assetSelection.v1";
const customPresetStorageKey = "three-mmd-loader.viewer.customPresets.v1";
const fixtureOrderStorageKey = "three-mmd-loader.viewer.fixtureOrder.v1";
const legacyRecentStorageKeys = [
  "three-mmd-loader.viewer.recentAssets.v2",
  "three-mmd-loader.viewer.recentAssets.v1"
];
const recencyLimit = 24;

const assetCategories = {
  models: {
    select: () => dom.assetModelSelect,
    button: () => dom.assetModelLoadButton,
    load: (asset) => loadModelFromUrl(asset.url)
  },
  motions: {
    select: () => dom.assetMotionSelect,
    button: () => dom.assetMotionLoadButton,
    load: (asset) => loadMotionFromUrl(asset.url)
  },
  backgrounds: {
    select: () => dom.assetBackgroundSelect,
    button: () => dom.assetBackgroundLoadButton,
    load: (asset) => loadBackgroundFromUrl(asset.url)
  },
  audios: {
    select: () => dom.assetAudioSelect,
    button: () => dom.assetAudioLoadButton,
    load: (asset) => loadAudioFromUrl(asset.url, labelFromUrl(asset.url), {
      offsetFrame: asset.audioOffsetFrame ?? asset.offsetFrame
    })
  },
  cameras: {
    select: () => dom.assetCameraSelect,
    button: () => dom.assetCameraLoadButton,
    load: (asset) => loadCameraFromUrl(asset.url)
  }
};

export async function initializeAssetLibrary() {
  clearLegacyRecentStorage();
  const [manifest, customPresets] = await Promise.all([
    fetchLocalAssetManifest(),
    Promise.resolve(readCustomPresets())
  ]);

  state.hasLocalFixtures = manifest !== undefined;

  if (!state.hasLocalFixtures) {
    removeFixtureUi();
  }

  state.assetLibrary = {
    presets: [...(manifest?.presets ?? []), ...(state.hasLocalFixtures ? customPresets : [])],
    models: manifest?.models ?? [],
    motions: manifest?.motions ?? [],
    poses: manifest?.poses ?? [],
    backgrounds: manifest?.backgrounds ?? [],
    audios: manifest?.audios ?? [],
    cameras: manifest?.cameras ?? []
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
  dom.assetPresetDeleteButton?.addEventListener("click", deleteSelectedAssetPreset);
  dom.assetPresetSelect?.addEventListener("change", updatePresetDeleteButton);
  for (const [category, config] of Object.entries(assetCategories)) {
    config.button()?.addEventListener("click", () => {
      const asset = findSelectedAsset(state.assetLibrary[category], config.select());
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
    if (!loadAudioFromUrl(preset.audioUrl, labelFromUrl(preset.audioUrl), {
      offsetFrame: preset.audioOffsetFrame ?? preset.audio?.offsetFrame
    })) {
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
  updatePresetDeleteButton();
  setStatus(`Saved preset: ${trimmedName}`, "ready");
}

function deleteSelectedAssetPreset() {
  const preset = findSelectedAsset(state.assetLibrary.presets, dom.assetPresetSelect);
  if (!preset || !isCustomPreset(preset)) {
    return;
  }
  if (!window.confirm(`Delete preset "${preset.name}"?`)) {
    return;
  }
  const customPresets = readCustomPresets().filter((entry) => entry.id !== preset.id);
  writeCustomPresets(customPresets);
  state.assetLibrary.presets = [
    ...state.assetLibrary.presets.filter((entry) => !isCustomPreset(entry)),
    ...customPresets
  ];
  updatePresetControls();
  setStatus(`Deleted preset: ${preset.name}`, "ready");
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
  rememberFixtureUse(category, asset.id);
  updateAssetLibraryControls();
  setStatus("", "ready");
}

function updateAssetLibraryControls() {
  updatePresetControls();
  for (const [category, config] of Object.entries(assetCategories)) {
    updateSelect(config.select(), sortByRecency(category, state.assetLibrary[category]));
    setButtonHidden(config.button(), state.assetLibrary[category].length === 0);
  }
  updateChromeHeights();
}

function updatePresetControls() {
  updateSelect(dom.assetPresetSelect, state.assetLibrary.presets);
  setButtonHidden(dom.assetPresetLoadButton, state.assetLibrary.presets.length === 0);
  updatePresetDeleteButton();
  updatePresetSectionVisibility();
}

function updatePresetDeleteButton() {
  const preset = findSelectedAsset(state.assetLibrary.presets, dom.assetPresetSelect);
  setButtonHidden(dom.assetPresetDeleteButton, !preset || !isCustomPreset(preset));
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

function sortByRecency(category, assets) {
  const order = readFixtureOrder()[category] ?? [];
  if (order.length === 0) {
    return assets;
  }
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...assets].sort((a, b) => {
    const rankA = rank.has(a.id) ? rank.get(a.id) : Number.POSITIVE_INFINITY;
    const rankB = rank.has(b.id) ? rank.get(b.id) : Number.POSITIVE_INFINITY;
    return rankA - rankB;
  });
}

function rememberFixtureUse(category, assetId) {
  const order = readFixtureOrder();
  const existing = Array.isArray(order[category]) ? order[category] : [];
  order[category] = [assetId, ...existing.filter((id) => id !== assetId)].slice(0, recencyLimit);
  writeFixtureOrder(order);
}

function readFixtureOrder() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(fixtureOrderStorageKey) ?? "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore malformed storage.
  }
  return {};
}

function writeFixtureOrder(order) {
  try {
    window.localStorage.setItem(fixtureOrderStorageKey, JSON.stringify(order));
  } catch {
    // Ignore storage failures.
  }
}

function clearLegacyRecentStorage() {
  for (const key of legacyRecentStorageKeys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
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
    ...(audioUrl ? { audioUrl, audioOffsetFrame: state.audioOffsetFrame } : {}),
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
  const modelLabel = modelUrl ? labelFromUrl(modelUrl) : "";
  const motionLabel = motionUrl ? labelFromUrl(motionUrl) : "";
  if (modelLabel && motionLabel) {
    return `${modelLabel} + ${motionLabel}`;
  }
  return modelLabel || motionLabel || "Current preset";
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
