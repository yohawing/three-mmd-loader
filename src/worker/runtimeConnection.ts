import type { DefaultMmdRuntimeOptions } from "../runtime/types.js";
import type { ThreeMmdRuntimeFactoryContext } from "../three/index.js";
import type {
  MmdRuntimeWorkerCommand,
  MmdRuntimeWorkerEvent
} from "./messages.js";
import type { CustomBulletWorkerPhysicsConfig } from "./externalPhysics.js";
import type { MmdRuntimeWorkerPool } from "./pool.js";

export interface MmdRuntimeWorkerLike {
  postMessage(message: MmdRuntimeWorkerCommand, transfer?: Transferable[]): void;
  terminate?: () => void | Promise<number>;
  addEventListener?: (type: string, listener: (event: { readonly data: MmdRuntimeWorkerEvent }) => void) => void;
  removeEventListener?: (type: string, listener: (event: { readonly data: MmdRuntimeWorkerEvent }) => void) => void;
  on?: (type: string, listener: (event: MmdRuntimeWorkerEvent) => void) => void;
  off?: (type: string, listener: (event: MmdRuntimeWorkerEvent) => void) => void;
  onmessage?: unknown;
  onerror?: unknown;
}

export interface WorkerMmdRuntimeOptions {
  readonly workerFactory?: (
    context: ThreeMmdRuntimeFactoryContext
  ) => MmdRuntimeWorkerLike;
  readonly workerUrl?: string | URL;
  readonly workerOptions?: WorkerOptions;
  readonly runtimeOptions?: DefaultMmdRuntimeOptions;
  readonly onFallback?: (error: unknown) => void;
  /** Allows a failed worker to continue through an equivalent inline runtime. Defaults to true. */
  readonly fallback?: boolean;
  /** Explicit bounded pool; the factory creates one lazily when omitted. */
  readonly pool?: MmdRuntimeWorkerPool;
  /** Physical slot count for the factory-owned pool. */
  readonly poolSize?: number;
  /** Structured-clone-safe external physics configuration for worker init. */
  readonly externalPhysics?: CustomBulletWorkerPhysicsConfig;
  /** Uses SAB pose transport when cross-origin isolation permits it. Defaults to auto. */
  readonly sharedMemory?: "auto" | "required" | "disabled";
}

export function createDefaultWorker(options: WorkerMmdRuntimeOptions): MmdRuntimeWorkerLike {
  const WorkerConstructor = (globalThis as typeof globalThis & {
    Worker?: new (url: string | URL, options?: WorkerOptions) => MmdRuntimeWorkerLike;
  }).Worker;
  if (!WorkerConstructor) {
    throw new Error("MMD runtime worker is unavailable in this environment");
  }
  const workerUrl = options.workerUrl ?? new URL("./entry.js", import.meta.url);
  return new WorkerConstructor(workerUrl, {
    type: "module",
    ...options.workerOptions
  });
}

export function workerRuntimeOptions(
  options: DefaultMmdRuntimeOptions
): Omit<DefaultMmdRuntimeOptions, "physicsBackend"> {
  return {
    frameRate: options.frameRate,
    initialSeconds: options.initialSeconds,
    physics: options.physics,
    ikTolerance: options.ikTolerance,
    ikMaxIterationsCap: options.ikMaxIterationsCap
  };
}

export function resolveSharedMemoryMode(mode: NonNullable<WorkerMmdRuntimeOptions["sharedMemory"]>): boolean {
  if (mode === "disabled") {
    return false;
  }
  const available =
    typeof SharedArrayBuffer !== "undefined" &&
    typeof Atomics !== "undefined" &&
    globalThis.crossOriginIsolated === true;
  if (mode === "required" && !available) {
    throw new Error("MMD runtime shared memory requires cross-origin isolation and SharedArrayBuffer");
  }
  return available;
}
