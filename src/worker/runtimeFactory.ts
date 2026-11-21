import { DefaultMmdRuntime } from "../runtime/core.js";
import type { MmdRuntime } from "../runtime/types.js";
import type { ThreeMmdRuntimeFactoryContext } from "../three/index.js";
import {
  MmdRuntimeWorkerPool,
  type MmdRuntimeWorkerPhysicalFactory
} from "./pool.js";
import { WorkerMmdRuntime } from "./runtime.js";
import type { WorkerMmdRuntimeOptions } from "./runtimeConnection.js";

export type WorkerMmdRuntimeFactoryOptions = WorkerMmdRuntimeOptions;

export interface WorkerMmdRuntimeFactory {
  (context: ThreeMmdRuntimeFactoryContext): MmdRuntime;
  /** Releases a factory-owned pool and its physical workers. */
  dispose(): void;
}

export function createWorkerMmdRuntimeFactory(
  options: WorkerMmdRuntimeFactoryOptions = {}
): WorkerMmdRuntimeFactory {
  let internalPool: MmdRuntimeWorkerPool | undefined;
  const factory = (context: ThreeMmdRuntimeFactoryContext): MmdRuntime => {
    try {
      if (options.runtimeOptions?.physics === "external" && !options.externalPhysics) {
        throw new Error("MMD runtime worker does not support external physics");
      }
      const pool = options.pool ?? (internalPool ??= new MmdRuntimeWorkerPool({
        size: options.poolSize,
        workerFactory: options.workerFactory as MmdRuntimeWorkerPhysicalFactory | undefined,
        workerUrl: options.workerUrl,
        workerOptions: options.workerOptions
      }));
      const runtime = new WorkerMmdRuntime(context, { ...options, pool });
      return runtime;
    } catch (error) {
      options.onFallback?.(error);
      if (options.fallback === false) {
        throw error;
      }
      return new DefaultMmdRuntime(options.runtimeOptions);
    }
  };
  factory.dispose = () => {
    if (!options.pool) {
      internalPool?.dispose();
    }
  };
  return factory;
}

export function createWorkerMmdRuntime(
  context: ThreeMmdRuntimeFactoryContext,
  options: WorkerMmdRuntimeOptions = {}
): MmdRuntime {
  return createWorkerMmdRuntimeFactory(options)(context);
}
