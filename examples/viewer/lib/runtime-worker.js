import { createViewerRuntimeOptions, state } from "./state.js";
import { viewerConfig } from "./viewer-config.js";
import { dom, setStatus, updatePlayToggle } from "./dom.js";

const workerDistRoute = "/__mmd_worker_dist__/";
let workerRuntimeFactory;
let workerRuntimeFactoryPromise;
let workerRuntimeGeneration = 0;
let workerModulePromise;

export function isWorkerRuntimeEnabled() {
  return state.activeRuntimeMode === "worker";
}

export async function prepareViewerRuntime() {
  if (viewerConfig.runtime !== "worker") {
    state.activeRuntimeMode = viewerConfig.runtime;
    state.runtimeTransport = "inline";
    state.runtimeReadiness = "ready";
    updateRuntimeStatusUi();
    return;
  }
  try {
    if (typeof window.Worker !== "function") {
      throw new Error("module Worker API is unavailable");
    }
    const workerModule = await loadWorkerModule();
    if (workerModule.getDefaultMmdRuntimeWorkerPoolSize() === 0) {
      throw new Error("no Worker slot is available on this device");
    }
    probeModuleWorker();
    state.activeRuntimeMode = "worker";
    state.runtimeTransport = globalThis.crossOriginIsolated === true
      ? "shared-array-buffer"
      : "transferable";
    state.runtimeReadiness = "pending";
    updateRuntimeStatusUi();
    await getWorkerRuntimeFactory();
  } catch (error) {
    activatePreflightFallback(error);
  }
}

export function updateWorkerRuntimeTelemetry() {
  if (!isWorkerRuntimeEnabled()) {
    state.runtimePoseAgeFrames = 0;
    return;
  }
  let maxPoseAgeFrames = 0;
  for (let index = 0; index < state.characterModels.length; index += 1) {
    const runtime = state.characterModels[index]?.runtime;
    const poseAgeFrames = runtime?.poseAgeFrames?.() ?? 0;
    if (poseAgeFrames > maxPoseAgeFrames) {
      maxPoseAgeFrames = poseAgeFrames;
    }
  }
  state.runtimePoseAgeFrames = maxPoseAgeFrames;
}

export function markWorkerRuntimesReady() {
  if (!isWorkerRuntimeEnabled()) {
    return;
  }
  let sharedMemory = false;
  for (let index = 0; index < state.characterModels.length; index += 1) {
    const runtime = state.characterModels[index]?.runtime;
    if (runtime?.workerReady?.() !== true) {
      return;
    }
    sharedMemory ||= runtime.sharedMemoryEnabled?.() === true;
  }
  state.runtimeTransport = sharedMemory ? "shared-array-buffer" : "transferable";
  state.runtimeReadiness = "ready";
  updateWorkerRuntimeTelemetry();
  updateRuntimeStatusUi();
}

export function getViewerRuntimeEvidence() {
  updateWorkerRuntimeTelemetry();
  return {
    requested: state.requestedRuntimeMode,
    active: state.activeRuntimeMode,
    transport: state.runtimeTransport,
    readiness: state.runtimeReadiness,
    poseAgeFrames: state.runtimePoseAgeFrames,
    fallbackReason: state.runtimeFallbackReason ?? null,
    failureStage: state.runtimeFailureStage ?? null,
    fallbackCount: state.workerRuntimeFallbackCount
  };
}

export async function getWorkerRuntimeFactory() {
  if (!isWorkerRuntimeEnabled()) {
    return undefined;
  }
  if (workerRuntimeFactory) {
    return workerRuntimeFactory;
  }
  if (workerRuntimeFactoryPromise) {
    return await workerRuntimeFactoryPromise;
  }
  const generation = workerRuntimeGeneration;
  const resettablePromise = loadWorkerModule().then(({ createWorkerMmdRuntimeFactory }) => {
    const factory = createWorkerMmdRuntimeFactory({
      runtimeOptions: createViewerRuntimeOptions({ physics: "external" }),
      externalPhysics: {
        kind: "custom-bullet-mmd",
        options: state.physicsTuningOptions
      },
      sharedMemory: "auto",
      workerUrl: new URL(`${workerDistRoute}worker/entry.js`, location.href),
      fallback: false,
      onFallback: reportWorkerRuntimeFallback
    });
    if (generation !== workerRuntimeGeneration) {
      factory.dispose();
      throw new Error("Runtime Worker factory creation was cancelled during viewer teardown.");
    }
    workerRuntimeFactory = factory;
    return factory;
  }).catch((error) => {
    if (workerRuntimeFactoryPromise === resettablePromise) {
      workerRuntimeFactoryPromise = undefined;
    }
    throw error;
  });
  workerRuntimeFactoryPromise = resettablePromise;
  return await resettablePromise;
}

export function disposeWorkerRuntimeFactory() {
  workerRuntimeGeneration += 1;
  workerRuntimeFactory?.dispose();
  workerRuntimeFactory = undefined;
  workerRuntimeFactoryPromise = undefined;
}

function loadWorkerModule() {
  workerModulePromise ??= import("../../../dist/worker/index.js");
  return workerModulePromise;
}

function probeModuleWorker() {
  const worker = new window.Worker(new URL(`${workerDistRoute}worker/entry.js`, location.href), {
    type: "module"
  });
  worker.terminate();
}

function activatePreflightFallback(error) {
  const message = error instanceof Error ? error.message : String(error);
  state.activeRuntimeMode = "mmd-anim";
  state.runtimeTransport = "inline";
  state.runtimeReadiness = "ready";
  state.runtimeFallbackReason = message;
  state.workerRuntimeFallback = message;
  state.workerRuntimeFallbackCount += 1;
  updateRuntimeStatusUi();
  window.console?.warn("[viewer] Worker preflight fallback", error);
  setStatus(`Worker unavailable; using inline runtime: ${message}`, "warning");
}

function reportWorkerRuntimeFallback(error) {
  const message = error instanceof Error ? error.message : String(error);
  const failureStage = state.runtimeFailureStage ??
    (state.runtimeReadiness === "ready" ? "runtime" : "initialization");
  state.workerRuntimeFallbackCount += 1;
  state.workerRuntimeFallback = message;
  state.runtimeFallbackReason = message;
  state.runtimeFailureStage = failureStage;
  state.runtimeReadiness = "failed";
  state.isPlaying = false;
  dom.bgmAudio?.pause();
  updatePlayToggle();
  updateRuntimeStatusUi();
  window.console?.error("[viewer] Worker runtime fallback", error);
  const statusMessage = `Runtime Worker ${failureStage} failed: ${message}. Reload with ?runtime=mmd-anim to continue inline.`;
  setStatus(statusMessage, "error");
  if (dom.runtimeErrorBanner) {
    dom.runtimeErrorBanner.textContent = statusMessage;
    dom.runtimeErrorBanner.hidden = false;
  }
}

function updateRuntimeStatusUi() {
  if (!dom.runtimeStatus) {
    return;
  }
  const runtimeLabel = state.activeRuntimeMode === "worker" ? "Worker" : `Inline ${state.activeRuntimeMode}`;
  const transportLabel = state.runtimeTransport === "shared-array-buffer"
    ? "SAB"
    : state.runtimeTransport === "transferable"
      ? "transfer"
      : state.runtimeTransport;
  dom.runtimeStatus.textContent = `${runtimeLabel} · ${transportLabel} · ${state.runtimeReadiness}`;
  dom.runtimeStatus.title = state.runtimeFallbackReason
    ? `Fallback: ${state.runtimeFallbackReason}`
    : dom.runtimeStatus.textContent;
  dom.runtimeStatus.classList.toggle("is-warning", state.activeRuntimeMode !== state.requestedRuntimeMode);
  dom.runtimeStatus.classList.toggle("is-error", state.runtimeReadiness === "failed");
}
