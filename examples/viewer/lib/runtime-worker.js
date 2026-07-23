import { createViewerRuntimeOptions, state } from "./state.js";
import { viewerConfig } from "./viewer-config.js";
import { setStatus } from "./dom.js";

const workerDistRoute = "/__mmd_worker_dist__/";
let workerRuntimeFactory;
let workerRuntimeFactoryPromise;
let workerRuntimeGeneration = 0;

export function isWorkerRuntimeEnabled() {
  return viewerConfig.runtime === "worker";
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
  const resettablePromise = import("../../../dist/worker/index.js").then(({ createWorkerMmdRuntimeFactory }) => {
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

function reportWorkerRuntimeFallback(error) {
  const message = error instanceof Error ? error.message : String(error);
  state.workerRuntimeFallbackCount += 1;
  state.workerRuntimeFallback = message;
  window.console?.error("[viewer] Worker runtime fallback", error);
  setStatus(`Runtime Worker failed: ${message}`, "error");
}
