import {
  ThreeMmdLoader,
  createMmdTextureMapFromFiles,
  findMmdModelFiles,
  syncMmdSpecularDirection
} from "../../../dist/three/index.js";
import { DDSLoader } from "three/addons/loaders/DDSLoader.js";

import { reportTextureDiagnostics } from "./diagnostics.js";
import { dom, setStatus, updateStageState } from "./dom.js";
import { disposeModelResources } from "./dispose.js";
import { renderStillFrame } from "./playback.js";
import { state } from "./state.js";
import { labelFromUrl } from "./url-label.js";

export async function loadBackgroundFromUrl(url) {
  return await loadBackground(url, labelFromUrl(url), () => createBackgroundLoader(url), {
    id: `url:${url}`,
    source: url
  });
}

export async function loadBackgroundFile(file) {
  await loadBackground(file, file.name, createBackgroundLoader, {
    id: `file:${file.name}:${file.lastModified}`,
    source: file
  });
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
  await loadBackground(modelFile, modelFile.name, () => folderLoader, {
    id: `folder:${modelFile.name}`,
    source: modelFile
  });
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
  try {
    setStatus(`Loading background: ${label}`, "loading");
    clearBackground();
    const loader = loaderFactory();
    const background = await loader.loadModel(source, { frustumCulled: false });
    state.currentBackground = background;
    syncMmdSpecularDirection(background.mesh.material, state.keyLight);
    state.scene.add(
      background.mesh,
      ...(background.outlineMeshes ?? []),
      ...(background.renderOrderMeshes ?? [])
    );
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
    setStatus(error instanceof Error ? error.message : String(error), "error");
    return false;
  }
}

export function clearBackground() {
  if (!state.currentBackground) {
    state.currentBackgroundEntries = [];
    updateBackgroundSwitcher();
    updateStageState();
    return;
  }
  state.scene.remove(
    state.currentBackground.mesh,
    ...(state.currentBackground.outlineMeshes ?? []),
    ...(state.currentBackground.renderOrderMeshes ?? [])
  );
  disposeModelResources(state.currentBackground);
  state.currentBackground = undefined;
  state.currentBackgroundEntries = [];
  updateBackgroundSwitcher();
  updateStageState();
}

function updateBackgroundSwitcher(selectedEntry) {
  if (!(dom.backgroundSwitcher instanceof window.HTMLSelectElement)) {
    return;
  }
  if (selectedEntry) {
    state.currentBackgroundEntries = [selectedEntry];
  }
  dom.backgroundSwitcher.replaceChildren(
    ...state.currentBackgroundEntries.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      return option;
    })
  );
  if (selectedEntry) {
    dom.backgroundSwitcher.value = selectedEntry.id;
  }
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
