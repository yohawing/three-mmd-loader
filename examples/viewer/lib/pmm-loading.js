import { parsePmmManifest } from "../../../dist/parser/index.js";
import { createMmdFileIndex } from "../../../dist/three/index.js";
import { setStatus } from "./dom.js";
import { createFolderTextureMap, createModelLoader, loadModel } from "./model-loading.js";
import { loadMotion } from "./motion-loading.js";
import { loadCameraFile } from "./camera-loading.js";
import { loadAudioFile } from "./audio-loading.js";
import { state } from "./state.js";

export async function loadPmmFolder(files) {
  const pmmFile = findPmmFile(files);
  if (!pmmFile) {
    setStatus("No .pmm file found in the selected folder.", "error");
    return;
  }

  try {
    setStatus(`Loading PMM project: ${pmmFile.name}`, "loading");
    const bytes = new Uint8Array(await pmmFile.arrayBuffer());
    const manifest = parsePmmManifest(bytes);
    const fileIndex = createMmdFileIndex(files);
    const plan = resolvePmmLoadPlan(manifest, fileIndex);

    logPmmPlan(pmmFile.name, manifest, plan);

    if (!plan.modelFile) {
      setStatus("PMM project: no model files found in folder.", "error");
      return;
    }

    // Set up texture map from the folder files
    const textureMap = createFolderTextureMap(files, plan.modelFile);
    state.currentFolderTextureMap = textureMap;

    // Load model
    await loadModel(plan.modelFile, plan.modelFile.name, () =>
      createModelLoader({ textureMap })
    );

    // Load motion if found
    if (plan.motionFile) {
      await loadMotion(plan.motionFile);
    }

    // Load camera motion if found
    if (plan.cameraFile) {
      await loadCameraFile(plan.cameraFile);
    }

    // Load audio if found
    if (plan.audioFile) {
      loadAudioFile(plan.audioFile);
    }

    setStatus("", "ready");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

function findPmmFile(files) {
  return files.find((file) => file.name.toLowerCase().endsWith(".pmm"));
}

function resolvePmmLoadPlan(manifest, fileIndex) {
  let modelFile = undefined;
  let motionFile = undefined;
  let cameraFile = undefined;
  let audioFile = undefined;

  // Resolve first model
  for (const modelPath of manifest.modelPaths) {
    const file = fileIndex.resolve(modelPath);
    if (file) {
      modelFile = file;
      break;
    }
  }
  // Fallback: use first model from file index
  if (!modelFile && fileIndex.models.length > 0) {
    modelFile = fileIndex.models[0];
  }

  // Resolve first motion (try motion paths first, then file index)
  for (const motionPath of manifest.motionPaths) {
    const file = fileIndex.resolve(motionPath);
    if (file) {
      motionFile = file;
      break;
    }
  }
  if (!motionFile && fileIndex.motions.length > 0) {
    motionFile = fileIndex.motions[0];
  }

  // Resolve audio
  for (const audioPath of manifest.audioPaths) {
    const file = fileIndex.resolve(audioPath);
    if (file) {
      audioFile = file;
      break;
    }
  }
  if (!audioFile && fileIndex.audios.length > 0) {
    audioFile = fileIndex.audios[0];
  }

  return {
    modelFile,
    motionFile,
    cameraFile,
    audioFile,
    resolvedModelPaths: manifest.modelPaths.length,
    resolvedMotionPaths: manifest.motionPaths.length,
    resolvedAudioPaths: manifest.audioPaths.length
  };
}

function logPmmPlan(fileName, manifest, plan) {
  globalThis.console?.groupCollapsed?.(
    `[mmd-viewer] PMM project: ${fileName}`
  );
  globalThis.console?.log?.("manifest:", {
    models: manifest.modelPaths.length,
    motions: manifest.motionPaths.length,
    audios: manifest.audioPaths.length,
    accessories: manifest.accessoryPaths.length
  });
  globalThis.console?.log?.("resolved:", {
    model: plan.modelFile?.name ?? "(none)",
    motion: plan.motionFile?.name ?? "(none)",
    audio: plan.audioFile?.name ?? "(none)"
  });
  globalThis.console?.groupEnd?.();
}
