import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("example viewer source", () => {
  it("clears model resources through the texture-aware dispose helper", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const disposeSource = await readFile("examples/viewer/lib/dispose.js", "utf8");

    expect(modelSource).toContain("disposeModelResources(state.currentModel)");
    expect(disposeSource).toContain('import { disposeMmdModel } from "../../../dist/three/index.js"');
    expect(disposeSource).toContain("disposeMmdModel(model)");
    expect(disposeSource).not.toContain("function collectMaterialTextures(material)");
  });

  it("surfaces texture diagnostics from loaded models", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const diagnosticsSource = await readFile("examples/viewer/lib/diagnostics.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(modelSource).toContain("reportTextureDiagnostics(state.currentModel)");
    expect(diagnosticsSource).toContain("model.textureDiagnostics ?? []");
    expect(diagnosticsSource).toContain('globalThis.console.warn("[mmd-viewer] texture diagnostics:"');
    expect(diagnosticsSource).toContain('setStatus(');
    expect(diagnosticsSource).toContain('"warning"');
    expect(domSource).toContain("dom.topBar?.classList.toggle(\"is-warning\"");
    expect(styles).toContain(".top-bar.is-warning .status");
  });

  it("keeps same-folder PMX variants in a switcher instead of reloading them during folder drops", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(html).toContain('id="model-switcher"');
    expect(html).not.toContain('id="model-name"');
    expect(html).toContain('aria-label="Selected model"');
    expect(domSource).toContain('modelSwitcher: document.querySelector("#model-switcher")');
    expect(domSource).not.toContain("modelNameText");
    expect(stateSource).toContain("currentFolderTextureMap: undefined");
    expect(stateSource).toContain("currentFolderPmxFiles: []");
    expect(modelSource).toContain("state.currentFolderPmxFiles = [switcherEntry ?? createModelSwitcherEntry(source, label)]");
    expect(modelSource).toContain("state.currentFolderTextureMap = textureMap");
    expect(modelSource).toContain("state.currentFolderPmxFiles = modelFiles");
    expect(modelSource).toContain("updateModelSwitcher(modelFile)");
    expect(modelSource).toContain("findMmdModelFiles");
    expect(modelSource).toContain("createMmdTextureMapFromFiles");
    expect(modelSource).toContain("export async function switchFolderModel(modelFile)");
    expect(modelSource).toContain('setStatus(`Switching to ${modelFile.name}`, "loading")');
    expect(modelSource).toContain("createModelLoader({ textureMap: state.currentFolderTextureMap })");
    expect(modelSource).toContain("dom.modelControl.hidden = state.currentFolderPmxFiles.length === 0");
    expect(modelSource).toContain("preserveModelSwitcher: true");
    expect(modelSource).toContain("dom.timeline.max = String(Math.max(currentMotionDurationSeconds(), 0.001))");
    expect(mainSource).toContain("modelFileKey(file) === dom.modelSwitcher.value");
    expect(styles).toContain(".loaded-file-control select");

    const dropHandler = modelSource.slice(
      modelSource.indexOf("function handleDroppedFiles"),
      modelSource.indexOf("async function collectDroppedFiles")
    );
    expect(dropHandler).toContain("await loadModelFolder(files)");
    expect(dropHandler).toContain("if (!shouldLoadModelFolder)");
  });

  it("keeps same-folder VMD variants in a motion switcher instead of sequentially loading them", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const motionSource = await readFile("examples/viewer/lib/motion-loading.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");

    expect(html).toContain('id="motion-switcher"');
    expect(html).toContain('aria-label="Selected motion"');
    expect(html).not.toContain('id="motion-name"');
    expect(domSource).toContain('motionSwitcher: document.querySelector("#motion-switcher")');
    expect(domSource).not.toContain("motionNameText");
    expect(stateSource).toContain("currentMotionVmdFiles: []");
    expect(mainSource).toContain("state.currentMotionVmdFiles = [file]");
    expect(mainSource).toContain("motionFileKey(file) === dom.motionSwitcher.value");
    expect(modelSource).toContain("state.currentMotionVmdFiles = vmdFiles");
    expect(motionSource).toContain("export const findVmdFiles = findMmdMotionFiles");
    expect(motionSource).toContain("findMmdMotionFiles");
    expect(motionSource).toContain("export async function switchMotion(file)");
    expect(motionSource).toContain('setStatus(`Switching motion to ${file.name}`, "loading")');
    expect(motionSource).toContain("createMotionSwitcherEntry(source, label)");
    expect(motionSource).toContain('id: `url:${source}`');
    expect(motionSource).toContain("option.value = motionFileKey(file)");
    expect(motionSource).toContain("dom.motionControl.hidden = state.currentMotionVmdFiles.length === 0");

    const dropHandler = modelSource.slice(
      modelSource.indexOf("function handleDroppedFiles"),
      modelSource.indexOf("async function collectDroppedFiles")
    );
    expect(dropHandler).toContain("const vmdFiles = findVmdFiles(files)");
    expect(dropHandler).toContain("await loadMotion(vmdFiles[0])");
    expect(dropHandler).toContain("vmdFiles.includes(file)");
    expect(dropHandler).not.toContain('lowerName.endsWith(".vmd")');
    expect(dropHandler).not.toContain("await loadMotion(file)");
  });

  it("loads local viewer assets from the gitignored fixture inventory through the MMD data route", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const assetLibrarySource = await readFile("examples/viewer/lib/asset-library.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");
    const serverSource = await readFile("scripts/serve-example-viewer.mjs", "utf8");

    expect(html).toContain('id="asset-preset-section"');
    expect(html).toContain('id="asset-preset-select"');
    expect(html).toContain('id="save-current-preset"');
    expect(html).toContain('id="model-load-category"');
    expect(html).toContain('id="motion-load-category"');
    expect(html).toContain('id="audio-load-category"');
    expect(html).toContain('id="background-load-category"');
    expect(html).toContain('id="camera-load-category"');
    expect(html).toContain('for="asset-model-select"');
    expect(html).toContain('for="asset-motion-select"');
    expect(html).toContain('for="asset-background-select"');
    expect(html).toContain('for="asset-audio-select"');
    expect(html).toContain('for="asset-camera-select"');
    expect(html).toContain('id="load-asset-model"');
    expect(html).toContain('id="load-asset-motion"');
    expect(html).toContain('id="load-asset-background"');
    expect(html).toContain('id="load-asset-audio"');
    expect(html).toContain('id="load-asset-camera"');
    expect(html).toContain('id="recent-model-select"');
    expect(html).toContain('id="recent-motion-select"');
    expect(html).toContain('id="recent-background-select"');
    expect(html).toContain('id="recent-audio-select"');
    expect(html).toContain('id="recent-camera-select"');
    expect(html).toContain('id="loading-indicator"');
    expect(html).toContain('id="load-menu-icon"');
    expect(html).not.toContain('id="load-selected-assets"');
    expect(html).not.toContain('id="recent-assets-section"');
    expect(domSource).toContain('assetPresetSection: document.querySelector("#asset-preset-section")');
    expect(domSource).toContain('assetPresetSaveButton: document.querySelector("#save-current-preset")');
    expect(domSource).toContain('assetModelLoadButton: document.querySelector("#load-asset-model")');
    expect(domSource).toContain('recentModelSelect: document.querySelector("#recent-model-select")');
    expect(domSource).toContain('loadingIndicator: document.querySelector("#loading-indicator")');
    expect(domSource).toContain("function setLoadingIndicator");
    expect(domSource).toContain("export function updateLoadMenuIcon()");
    expect(domSource).toContain("export function toggleLoadMenu(event)");
    expect(stateSource).toContain("assetLibrary: {");
    expect(mainSource).toContain("initializeAssetLibrary");
    expect(mainSource).toContain("bindAssetLibraryControls");
    expect(mainSource).toContain('dom.loadMenu?.querySelector("summary")?.addEventListener("click", toggleLoadMenu)');
    expect(mainSource).not.toContain('document.addEventListener("click"');
    expect(mainSource).not.toContain('event.key === "Escape"');
    expect(assetLibrarySource).toContain('"/__mmd_assets__/fixtures-local.json"');
    expect(assetLibrarySource).toContain("selectionStorageKey");
    expect(assetLibrarySource).toContain("customPresetStorageKey");
    expect(assetLibrarySource).toContain("saveCurrentAssetPreset");
    expect(assetLibrarySource).toContain("createCurrentAssetPreset");
    expect(assetLibrarySource).toContain("readCustomPresets()");
    expect(assetLibrarySource).toContain("saveSelectedAssetSelection()");
    expect(assetLibrarySource).toContain("restoreSavedSelection(readSavedSelection())");
    expect(assetLibrarySource).toContain('select.closest(".asset-load-row")');
    expect(assetLibrarySource).toContain("const assetCategories = {");
    expect(assetLibrarySource).toContain("async function loadCategoryAsset(category, asset)");
    expect(assetLibrarySource).toContain("if (!await config.load(asset))");
    expect(assetLibrarySource).toContain("rememberRecentAsset(category, asset)");
    expect(assetLibrarySource).toContain('const recentStorageKey = "three-mmd-loader.viewer.recentAssets.v2"');
    expect(assetLibrarySource).toContain("migrateLegacyRecentAssets");
    expect(assetLibrarySource).not.toContain("Restoring selected assets");
    expect(assetLibrarySource).not.toContain("hasRestorableSelection");
    expect(assetLibrarySource).toContain("loadModelFromUrl(preset.modelUrl)");
    expect(assetLibrarySource).toContain("loadMotionFromUrl(preset.motionUrl)");
    expect(assetLibrarySource).toContain("loadBackgroundFromUrl");
    expect(assetLibrarySource).toContain("preset.backgroundUrl");
    expect(assetLibrarySource).toContain("preset.audioUrl");
    expect(assetLibrarySource).toContain("preset.cameraUrl");
    expect(assetLibrarySource).toContain("loadAudioFromUrl(asset.url");
    expect(assetLibrarySource).toContain("loadCameraFromUrl(asset.url)");
    expect(assetLibrarySource).not.toContain("async function loadSelectedAssets");
    expect(assetLibrarySource).not.toContain('const noneOptionValue = "__none__"');
    expect(assetLibrarySource).toContain("window.localStorage.setItem(recentStorageKey");
    expect(html).toContain('id="asset-background-select"');
    expect(html).toContain('id="asset-audio-select"');
    expect(html).toContain('id="asset-camera-select"');
    expect(serverSource).toContain('"fixtures.local.json"');
    expect(serverSource).toContain('const dataRoute = "/__mmd_data/"');
    expect(serverSource).toContain('const localAssetsRoute = "/__mmd_assets__/fixtures-local.json"');
    expect(serverSource).toContain("createLocalAssetManifest");
    expect(serverSource).toContain("backgrounds");
    expect(serverSource).toContain("backgroundPmx");
    expect(serverSource).toContain("backgroundPmd");
    expect(serverSource).toContain("audios");
    expect(serverSource).toContain("cameras");
    expect(serverSource).toContain("process.env.MMD_DATA_ROOT");
    expect(serverSource).not.toContain("MMD_VIEWER_DATA_ROOT");
    expect(styles).toContain(".asset-load-row");
    expect(styles).toContain(".asset-load-row label");
    expect(styles).toContain(".load-category");
    expect(styles).toContain(".load-category > summary");
    expect(styles).toContain(".loading-indicator");
    expect(styles).toContain("@keyframes loading-spin");
  });

  it("decodes URL labels and keeps background and camera imports separate from the main model", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const motionSource = await readFile("examples/viewer/lib/motion-loading.js", "utf8");
    const backgroundSource = await readFile("examples/viewer/lib/background-loading.js", "utf8");
    const cameraSource = await readFile("examples/viewer/lib/camera-loading.js", "utf8");
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");
    const urlLabelSource = await readFile("examples/viewer/lib/url-label.js", "utf8");

    expect(urlLabelSource).toContain("decodeURIComponent(label)");
    expect(modelSource).toContain("await loadModel(bytes, label, () => createUrlTextureLoader(url), profile");
    expect(motionSource).toContain("await loadMotion(url, labelFromUrl(url))");
    expect(html).toContain('id="choose-background"');
    expect(html).toContain('id="choose-camera"');
    expect(html).toContain('id="background-switcher"');
    expect(html).toContain('id="camera-switcher"');
    expect(html).toContain('id="audio-switcher"');
    expect(html).toContain('id="clear-background"');
    expect(html).toContain('id="clear-camera"');
    expect(html).toContain('id="clear-audio"');
    expect(mainSource).toContain("loadBackgroundUrl: loadBackgroundFromUrl");
    expect(mainSource).toContain("loadCameraUrl: loadCameraFromUrl");
    expect(mainSource).toContain("clearBackground()");
    expect(mainSource).toContain("clearCameraMotion()");
    expect(backgroundSource).toContain("state.currentBackground = background");
    expect(backgroundSource).toContain("disposeModelResources(state.currentBackground)");
    expect(backgroundSource).toContain("updateStageState()");
    expect(domSource).toContain("!state.currentModel && !state.currentBackground");
    expect(cameraSource).toContain("state.currentCameraMotion = {");
    expect(cameraSource).toContain("syncTimelineRangeToCurrentMotion()");
    expect(cameraSource).toContain("currentMotionDurationSeconds()");
    expect(cameraSource).not.toContain("existingMax");
    expect(cameraSource).not.toContain("sampleMmdCameraTrack");
    expect(cameraSource).toContain("function interpolateBezier");
    expect(cameraSource).toContain("function cubicBezier");
    expect(cameraSource).toContain("-lerp(previous.position[2], next.position[2]");
    expect(cameraSource).toContain("-lerp(previous.rotation[0], next.rotation[0]");
    expect(cameraSource).toContain("offset.set(0, 0, -distance)");
    expect(cameraSource).not.toContain("function cameraFrameAt");
    expect(playbackSource).toContain("applyCameraMotion()");
    expect(stateSource).toContain("currentBackground: undefined");
    expect(stateSource).toContain("currentCameraMotion: undefined");
    expect(stateSource).toContain("cameraTargetScratch: new THREE.Vector3()");
  });

  it("keeps audio playback resume from seeking back to the start", async () => {
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");

    expect(playbackSource).toContain("syncMotionToAudioTime({ evaluate: false });");
    expect(playbackSource).toContain("syncAudioToMotionTime({ onlyIfDrifted: true })");
    expect(playbackSource).toContain("Math.abs(dom.bgmAudio.currentTime - targetTime) < 0.05");
    expect(playbackSource).toContain("state.isSyncingAudioTime = true;");
    expect(playbackSource).toContain("export function finishAudioTimeSync()");
    expect(mainSource).toContain("if (finishAudioTimeSync()) return;");
    expect(playbackSource).toContain("function hasTimelineSource()");
    expect(mainSource).toContain("function hasTimelineSource()");
    expect(mainSource).not.toContain("!state.isPlaying || !hasCurrentMotion()");
  });

  it("delegates Ammo script loading to the public physics browser loader", async () => {
    const ammoSource = await readFile("examples/viewer/lib/ammo-bootstrap.js", "utf8");

    expect(ammoSource).toContain("loadAmmoNamespace");
    expect(ammoSource).toContain("state.ammoScriptLoadPromise ??= loadAmmoNamespace(state.ammoScriptUrl)");
    expect(ammoSource).toContain("dom.physicsErrorBanner.textContent = message");
    expect(ammoSource).not.toContain("function loadAmmoScript");
    expect(ammoSource).not.toContain("function getAmmoCandidate");
  });

  it("profiles viewer model load stages only behind the perf query flag", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const performanceSource = await readFile("examples/viewer/lib/performance.js", "utf8");

    expect(modelSource).toContain("createViewerLoadProfile");
    expect(modelSource).toContain('profile?.measure("loader-loadModel", "loader-ready", "model-loaded")');
    expect(modelSource).toContain('profile?.measure("first-render", "animation-ready", "first-render")');
    expect(performanceSource).toContain('new window.URLSearchParams(location.search).has("perf")');
    expect(performanceSource).toContain('"__THREE_MMD_LOADER_PERF__"');
    expect(performanceSource).toContain('window.console?.table(');
  });

  it("serves Wasm with the browser streaming MIME type", async () => {
    const serverSource = await readFile("scripts/serve-example-viewer.mjs", "utf8");

    expect(serverSource).toContain('[".wasm", "application/wasm"]');
  });
});
