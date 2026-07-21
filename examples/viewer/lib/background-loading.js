import {
  ThreeMmdLoader,
  createMmdTextureMapFromFiles,
  findMmdModelFiles,
  syncMmdSpecularDirection
} from "../../../dist/three/index.js";
import { DDSLoader } from "three/addons/loaders/DDSLoader.js";

import { reportTextureDiagnostics } from "./diagnostics.js";
import { dom, setLoadedFileSwitcherOptions, setStatus, updateStageState } from "./dom.js";
import { disposeModelResources } from "./dispose.js";
import { renderStillFrame } from "./playback.js";
import { adaptCameraDepthRange } from "./scene-setup.js";
import { state } from "./state.js";
import { labelFromUrl } from "./url-label.js";
import {
  applyViewerPipelineToModel,
  createViewerBackgroundLoadOptions,
  isTslViewerPipeline
} from "./viewer-pipeline.js";

let backgroundLoadGeneration = 0;

export async function loadBackgroundFromUrl(url) {
  return await loadBackground(url, labelFromUrl(url), () => createBackgroundLoader(url), {
    id: `url:${url}`,
    source: url
  });
}

export async function loadBackgroundFile(file) {
  const loaded = await loadBackground(file, file.name, createBackgroundLoader, {
    id: `file:${file.name}:${file.lastModified}`,
    source: file
  });
  if (loaded) {
    state.currentBackgroundFiles = [file];
  }
}

export async function loadBackgroundFolder(files) {
  const modelFiles = findMmdModelFiles(files);
  const modelFile = modelFiles[0];
  if (!modelFile) {
    setStatus("No PMX or PMD background model found in the selected folder.", "error");
    return;
  }
  const textureMap = createMmdTextureMapFromFiles(files, modelFile);
  const folderLoader = createBackgroundLoader(undefined, { textureMap });
  const loaded = await loadBackground(modelFile, modelFile.name, () => folderLoader, {
    id: `folder:${modelFile.name}`,
    source: modelFile
  });
  if (loaded) {
    state.currentBackgroundFiles = files;
  }
}

export async function switchBackgroundEntry(entry) {
  if (!entry) {
    return;
  }
  const loaderFactory = typeof entry.source === "string"
    ? () => createBackgroundLoader(entry.source)
    : createBackgroundLoader;
  await loadBackground(entry.source, entry.name, loaderFactory, entry);
}

async function loadBackground(source, label, loaderFactory, entry) {
  const generation = ++backgroundLoadGeneration;
  let background;
  let backgroundDisposed = false;
  try {
    setStatus(`Loading background: ${label}`, "loading");
    clearCommittedBackground();
    const loader = loaderFactory();
    background = await loader.loadModel(source, createViewerBackgroundLoadOptions());
    if (generation !== backgroundLoadGeneration) {
      disposeLoadedBackground();
      return false;
    }
    await applyViewerPipelineToModel(background, label, { role: "background" });
    if (generation !== backgroundLoadGeneration) {
      disposeLoadedBackground();
      return false;
    }
    state.currentBackground = background;
    if (!isTslViewerPipeline()) {
      syncMmdSpecularDirection(background.mesh.material, state.keyLight);
    }
    state.scene.add(background.root);
    adaptCameraDepthRange();
    reportTextureDiagnostics(background);
    updateBackgroundSwitcher({
      ...entry,
      name: label
    });
    updateStageState();
    setStatus("", "ready");
    renderStillFrame();
    return true;
  } catch (error) {
    disposeLoadedBackground();
    setStatus(error instanceof Error ? error.message : String(error), "error");
    return false;
  }

  function disposeLoadedBackground() {
    if (!background || backgroundDisposed) {
      return;
    }
    backgroundDisposed = true;
    if (state.currentBackground === background) {
      clearBackground();
      return;
    }
    disposeModelResources(background);
  }
}

export function clearBackground() {
  backgroundLoadGeneration += 1;
  clearCommittedBackground();
}

function clearCommittedBackground() {
  if (!state.currentBackground) {
    state.currentBackgroundFiles = [];
    state.currentBackgroundEntries = [];
    updateBackgroundSwitcher();
    updateStageState();
    return;
  }
  state.scene.remove(state.currentBackground.root);
  disposeModelResources(state.currentBackground);
  state.currentBackground = undefined;
  state.currentBackgroundFiles = [];
  state.currentBackgroundEntries = [];
  updateBackgroundSwitcher();
  updateStageState();
  adaptCameraDepthRange();
}

function updateBackgroundSwitcher(selectedEntry) {
  if (selectedEntry) {
    state.currentBackgroundEntries = [selectedEntry];
  }
  setLoadedFileSwitcherOptions(
    dom.backgroundSwitcher,
    state.currentBackgroundEntries.map((entry) => ({
      value: entry.id,
      label: entry.name
    })),
    selectedEntry?.id
  );
  if (dom.backgroundControl) {
    dom.backgroundControl.hidden = state.currentBackgroundEntries.length === 0;
  }
}

function createBackgroundLoader(modelUrl, extraOptions = {}) {
  return new ThreeMmdLoader({
    ddsLoader: new DDSLoader(),
    geometryAwareAlpha: true,
    ...extraOptions,
    ...(modelUrl
      ? {
          textureResolver: {
            async resolve(path) {
              return new URL(
                path.replaceAll("\\", "/"),
                new URL(".", new URL(modelUrl, location.href))
              ).toString();
            }
          }
        }
      : {})
  });
}
