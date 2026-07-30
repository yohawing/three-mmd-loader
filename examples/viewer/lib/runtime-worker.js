import { createViewerRuntimeOptions, state } from "./state.js";
import { viewerConfig } from "./viewer-config.js";
import { setStatus } from "./dom.js";

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
    await getWorkerRuntimeFactory();
  } catch (error) {
    activatePreflightFallback(error);
  }
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
  window.console?.warn("[viewer] Worker preflight fallback", error);
  setStatus(`Worker unavailable; using inline runtime: ${message}`, "warning");
}

function reportWorkerRuntimeFallback(error) {
  const message = error instanceof Error ? error.message : String(error);
  state.workerRuntimeFallbackCount += 1;
  state.workerRuntimeFallback = message;
  window.console?.error("[viewer] Worker runtime fallback", error);
  setStatus(`Runtime Worker failed: ${message}`, "error");
}
