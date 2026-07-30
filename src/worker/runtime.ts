import { DefaultMmdRuntime } from "../runtime/core.js";
import type {
  DefaultMmdRuntimeOptions,
  MmdFrameState,
  MmdRuntime,
  MmdRuntimeAsyncTickOptions,
  MmdRuntimeDebugState,
  MmdRuntimeEvaluateOptions,
  MmdRuntimeTickOptions
} from "../runtime/types.js";
import type { MmdAnimation, CameraState, LightState } from "../parser/model/modelTypes.js";
import type * as THREE from "three";
import { sampleMmdCameraTrackInto, sampleMmdLightTrackInto } from "../runtime/animation.js";
import type { ThreeMmdRuntimeFactoryContext } from "../three/index.js";
import {
  applyMmdRuntimePoseToMesh,
  createMmdRuntimePoseApplyScratch,
  type MmdRuntimePoseApplyScratch
} from "./applyPose.js";
import type {
  MmdRuntimeWorkerCommand,
  MmdRuntimeWorkerEvent
} from "./messages.js";
import type { CustomBulletWorkerPhysicsConfig } from "./externalPhysics.js";
import { serializeMmdRuntimeModelDescriptor } from "./modelDescriptor.js";
import type { MmdRuntimePoseBuffer } from "./protocol.js";
import {
  createMmdRuntimeSharedPoseReadBuffer,
  createMmdRuntimeSharedPoseSlots,
  readMmdRuntimeSharedPoseInto,
  releaseMmdRuntimeSharedPoseReadSlot,
  type MmdRuntimeSharedPoseSlot
} from "./sharedPose.js";
import {
  MmdRuntimeWorkerPool,
  type MmdRuntimeWorkerLease,
  type MmdRuntimeWorkerPhysicalFactory
} from "./pool.js";

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

export type WorkerMmdRuntimeFactoryOptions = WorkerMmdRuntimeOptions;

export interface WorkerMmdRuntimeFactory {
  (context: ThreeMmdRuntimeFactoryContext): MmdRuntime;
  /** Releases a factory-owned pool and its physical workers. */
  dispose(): void;
}

interface MutableWorkerCommand {
  type: "setAnimation" | "tick" | "seek" | "resetPose" | "clearAnimation";
  epoch: number;
  animation?: MmdAnimation;
  seconds?: number;
  options?: MmdRuntimeEvaluateOptions;
}

interface SettledRequest {
  readonly epoch: number;
  readonly resolve: (state: MmdFrameState) => void;
  readonly reject: (error: Error) => void;
  readonly signal: AbortSignal | undefined;
  readonly onAbort: (() => void) | undefined;
}

interface ReadyWaiter {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

const emptyDebugState = {
  stages: {
    vmdInterpolation: { worldMatricesColumnMajor: [], morphWeights: [] },
    appendTransform: { worldMatricesColumnMajor: [], morphWeights: [] },
    ik: { worldMatricesColumnMajor: [], morphWeights: [] },
    physics: { worldMatricesColumnMajor: [], morphWeights: [] }
  }
} satisfies MmdRuntimeDebugState;

/**
 * Main-thread proxy for one logical runtime worker. Worker messages are
 * asynchronous by design: tick returns the last published frame while the
 * worker evaluates the newest absolute time, and pose age reports the lag.
 */
export class WorkerMmdRuntime implements MmdRuntime {
  private readonly mesh: ThreeMmdRuntimeFactoryContext["mesh"];
  private readonly runtimeOptions: DefaultMmdRuntimeOptions;
  private readonly applyScratch: MmdRuntimePoseApplyScratch;
  private readonly frameStateScratch: MutableFrameState = {
    seconds: 0,
    frame: 0,
    frameRate: 30
  };
  private readonly cameraStateScratch: CameraState = {
    distance: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    fov: 1,
    perspective: true
  };
  private readonly cameraFrameHint = { index: 0 };
  private readonly lightStateScratch: LightState = {
    color: [0, 0, 0],
    direction: [0, 0, 0]
  };
  private readonly setAnimationCommand: MutableWorkerCommand = {
    type: "setAnimation",
    epoch: 0
  };
  private readonly tickCommand: MutableWorkerCommand = {
    type: "tick",
    epoch: 0,
    seconds: 0
  };
  private readonly seekCommand: MutableWorkerCommand = {
    type: "seek",
    epoch: 0,
    seconds: 0
  };
  private readonly resetPoseCommand: MutableWorkerCommand = {
    type: "resetPose",
    epoch: 0
  };
  private readonly clearAnimationCommand: MutableWorkerCommand = {
    type: "clearAnimation",
    epoch: 0
  };
  private readonly workerEvaluateOptions: MutableEvaluateOptions = {};
  private readonly fallbackTickOptions: MutableFallbackTickOptions;
  private readonly recycleCommand = {
    type: "recycle" as const,
    pose: undefined as unknown as MmdRuntimePoseBuffer
  };
  private readonly sharedReleaseCommand = { type: "sharedRelease" as const };
  private readonly onMessageBound = (event: { readonly data: MmdRuntimeWorkerEvent }) => {
    this.handleEvent(event.data);
  };
  private readonly onNodeMessageBound = (event: MmdRuntimeWorkerEvent) => {
    this.handleEvent(event);
  };
  private readonly onErrorBound = (error: unknown) => {
    this.activateFallback(error);
  };
  private readonly worker: MmdRuntimeWorkerLike;
  private readonly poolLease: MmdRuntimeWorkerLease | undefined;
  private readonly sharedPoseSlots: readonly MmdRuntimeSharedPoseSlot[] | undefined;
  private readonly sharedPoseReadBuffer: MmdRuntimePoseBuffer | undefined;
  private readonly settledRequests = new Map<number, SettledRequest>();
  private readonly readyWaiters: ReadyWaiter[] = [];
  private fallbackRuntime: DefaultMmdRuntime | undefined;
  private readonly inlineFallbackAllowed: boolean;
  private failed = false;
  private animation: MmdAnimation | undefined;
  private currentEpoch = 0;
  private lastAppliedSequence = -1;
  private lastPoseAgeSeconds = 0;
  private lastRequestedSeconds = 0;
  private nextRequestId = 1;
  private failureError: Error | undefined;
  private ready = false;
  private disposed = false;

  constructor(
    context: ThreeMmdRuntimeFactoryContext,
    options: WorkerMmdRuntimeOptions = {}
  ) {
    this.mesh = context.mesh;
    this.runtimeOptions = options.runtimeOptions ?? {};
    this.fallbackTickOptions = { mesh: this.mesh };
    this.inlineFallbackAllowed =
      options.fallback !== false &&
      (this.runtimeOptions.physics !== "external" || this.runtimeOptions.physicsBackend !== undefined);
    this.fallbackCallback = options.onFallback;
    this.applyScratch = createMmdRuntimePoseApplyScratch(this.mesh);
    this.poolLease = options.pool?.acquire(
      context,
      options.workerFactory as MmdRuntimeWorkerPhysicalFactory | undefined
    );
    this.worker = this.poolLease?.worker ??
      (options.workerFactory ? options.workerFactory(context) : createDefaultWorker(options));
    if (!this.worker) {
      throw new Error("MMD runtime worker is unavailable");
    }
    this.attachWorker(this.worker);
    const descriptor = serializeMmdRuntimeModelDescriptor(this.mesh);
    const sharedMemory = resolveSharedMemoryMode(options.sharedMemory ?? "auto");
    this.sharedPoseSlots = sharedMemory
      ? createMmdRuntimeSharedPoseSlots(descriptor.bones.length, descriptor.morphCount)
      : undefined;
    this.sharedPoseReadBuffer = sharedMemory
      ? createMmdRuntimeSharedPoseReadBuffer(descriptor.bones.length, descriptor.morphCount)
      : undefined;
    this.worker.postMessage({
      type: "init",
      descriptor,
      runtimeOptions: workerRuntimeOptions(this.runtimeOptions),
      sharedPoseSlots: this.sharedPoseSlots,
      externalPhysics: options.externalPhysics
    });
    this.frameStateScratch.frameRate = this.runtimeOptions.frameRate ?? 30;
    this.frameStateScratch.seconds = this.runtimeOptions.initialSeconds ?? 0;
    this.frameStateScratch.frame = this.frameStateScratch.seconds * this.frameStateScratch.frameRate;
  }

  poseAgeSeconds(): number {
    return this.lastPoseAgeSeconds;
  }

  poseAgeFrames(): number {
    return this.lastPoseAgeSeconds * this.frameStateScratch.frameRate;
  }

  workerReady(): boolean {
    return this.ready && !this.disposed && this.fallbackRuntime === undefined;
  }

  /** Resolves after the Worker and its external physics backend are initialized. */
  whenReady(): Promise<void> {
    if (this.workerReady()) {
      return Promise.resolve();
    }
    const inactiveError = this.inactiveError();
    if (inactiveError) {
      return Promise.reject(inactiveError);
    }
    return new Promise<void>((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
    });
  }

  sharedMemoryEnabled(): boolean {
    return this.sharedPoseSlots !== undefined;
  }

  setAnimation(animation: MmdAnimation, mesh: ThreeMmdRuntimeFactoryContext["mesh"]): void {
    this.assertMesh(mesh);
    this.assertActive();
    this.animation = animation;
    this.cameraFrameHint.index = 0;
    this.bumpEpoch();
    if (this.fallbackRuntime) {
      this.fallbackRuntime.setAnimation(animation, this.mesh);
      return;
    }
    this.setAnimationCommand.epoch = this.currentEpoch;
    this.setAnimationCommand.animation = animation;
    this.post(this.setAnimationCommand as MmdRuntimeWorkerCommand);
  }

  evaluate(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState {
    return this.tick(seconds, options);
  }

  tick(seconds: number, options?: MmdRuntimeTickOptions): MmdFrameState;
  tick(
    seconds: number,
    mesh: THREE.Object3D | null | undefined,
    options?: MmdRuntimeEvaluateOptions
  ): MmdFrameState;
  tick(
    seconds: number,
    meshOrOptions?: THREE.Object3D | MmdRuntimeTickOptions | null,
    deprecatedOptions?: MmdRuntimeEvaluateOptions
  ): MmdFrameState {
    this.assertActive();
    const options = isObject3D(meshOrOptions)
      ? deprecatedOptions
      : meshOrOptions ?? undefined;
    if (this.fallbackRuntime) {
      this.fallbackTickOptions.physics = options?.physics;
      this.fallbackTickOptions.ik = options?.ik;
      const state = this.fallbackRuntime.tick(seconds, this.fallbackTickOptions);
      this.copyFrameState(state);
      this.lastPoseAgeSeconds = 0;
      return this.frameStateScratch;
    }
    if (this.failed) {
      this.lastRequestedSeconds = seconds;
      this.lastPoseAgeSeconds = Math.max(seconds - this.frameStateScratch.seconds, 0);
      return this.frameStateScratch;
    }
    this.lastRequestedSeconds = seconds;
    this.tickCommand.epoch = this.currentEpoch;
    this.tickCommand.seconds = seconds;
    this.workerEvaluateOptions.physics = options?.physics;
    this.workerEvaluateOptions.ik = options?.ik;
    this.tickCommand.options = this.workerEvaluateOptions;
    this.post(this.tickCommand as MmdRuntimeWorkerCommand);
    return this.frameStateScratch;
  }

  tickAsync(seconds: number, options?: MmdRuntimeAsyncTickOptions): Promise<MmdFrameState> {
    this.assertActive();
    if (options?.signal?.aborted) {
      return Promise.reject(createAbortError());
    }
    if (this.fallbackRuntime) {
      this.fallbackTickOptions.physics = options?.physics;
      this.fallbackTickOptions.ik = options?.ik;
      const state = this.fallbackRuntime.tick(seconds, this.fallbackTickOptions);
      this.copyFrameState(state);
      this.lastPoseAgeSeconds = 0;
      return Promise.resolve(this.snapshotFrameState());
    }
    if (this.failed) {
      return Promise.reject(this.failureError ?? new Error("MMD runtime worker failed"));
    }
    const requestId = this.allocateRequestId();
    this.lastRequestedSeconds = seconds;
    return new Promise<MmdFrameState>((resolve, reject) => {
      const signal = options?.signal;
      const onAbort = signal
        ? () => this.rejectSettledRequest(requestId, createAbortError())
        : undefined;
      this.settledRequests.set(requestId, {
        epoch: this.currentEpoch,
        resolve,
        reject,
        signal,
        onAbort
      });
      signal?.addEventListener("abort", onAbort as () => void, { once: true });
      this.post({
        type: "tick",
        epoch: this.currentEpoch,
        seconds,
        options: {
          physics: options?.physics,
          ik: options?.ik
        },
        requestId
      });
    });
  }

  seek(seconds: number): MmdFrameState {
    this.assertActive();
    this.bumpEpoch();
    this.frameStateScratch.seconds = seconds;
    this.frameStateScratch.frame = seconds * this.frameStateScratch.frameRate;
    this.lastPoseAgeSeconds = 0;
    if (this.fallbackRuntime) {
      this.copyFrameState(this.fallbackRuntime.seek(seconds));
      return this.frameStateScratch;
    }
    this.seekCommand.epoch = this.currentEpoch;
    this.seekCommand.seconds = seconds;
    this.post(this.seekCommand as MmdRuntimeWorkerCommand);
    return this.frameStateScratch;
  }

  resetPose(): void {
    this.assertActive();
    this.bumpEpoch();
    if (this.fallbackRuntime) {
      this.fallbackRuntime.resetPose();
      return;
    }
    this.resetPoseCommand.epoch = this.currentEpoch;
    this.post(this.resetPoseCommand as MmdRuntimeWorkerCommand);
  }

  clearAnimation(): void {
    this.assertActive();
    this.animation = undefined;
    this.cameraFrameHint.index = 0;
    this.bumpEpoch();
    if (this.fallbackRuntime) {
      this.fallbackRuntime.clearAnimation();
      return;
    }
    this.clearAnimationCommand.epoch = this.currentEpoch;
    this.post(this.clearAnimationCommand as MmdRuntimeWorkerCommand);
  }

  cameraState(): CameraState | undefined {
    if (this.fallbackRuntime) {
      return this.fallbackRuntime.cameraState();
    }
    const frames = this.animation?.cameraFrames;
    return frames ? sampleMmdCameraTrackInto(frames, this.frameStateScratch.frame, this.cameraStateScratch, this.cameraFrameHint) : undefined;
  }

  lightState(): LightState | undefined {
    if (this.fallbackRuntime) {
      return this.fallbackRuntime.lightState();
    }
    const frames = this.animation?.lightFrames;
    return frames ? sampleMmdLightTrackInto(frames, this.frameStateScratch.frame, this.lightStateScratch) : undefined;
  }

  reset(seconds = 0): MmdFrameState {
    this.seek(seconds);
    this.resetPose();
    this.clearAnimation();
    return this.frameStateScratch;
  }

  frameState(): MmdFrameState {
    return this.snapshotFrameState();
  }

  debugState(): MmdRuntimeDebugState {
    return this.fallbackRuntime?.debugState() ?? emptyDebugState;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const disposeError = new Error("MMD runtime worker is disposed");
    this.rejectSettledRequests(disposeError);
    this.rejectReadyWaiters(disposeError);
    if (this.fallbackRuntime) {
      this.fallbackRuntime.clearAnimation();
    } else if (!this.poolLease) {
      this.worker.postMessage({ type: "dispose" });
    }
    this.poolLease?.dispose();
    this.detachWorker();
    if (!this.poolLease) {
      void this.worker.terminate?.();
    }
  }

  private handleEvent(event: MmdRuntimeWorkerEvent): void {
    if (this.disposed) {
      return;
    }
    if (event.type === "ready") {
      this.ready = true;
      this.resolveReadyWaiters();
      return;
    }
    if (event.type === "pose") {
      this.applyPose(event.pose, event.requestId);
      return;
    }
    if (event.type === "sharedPose") {
      this.applySharedPose(event.slot, event.requestId);
      return;
    }
    if (event.type === "error") {
      this.activateFallback(new Error(event.message));
    }
  }

  private applyPose(pose: MmdRuntimePoseBuffer, requestId?: number): void {
    const isCurrent = pose.epoch === this.currentEpoch && pose.sequence > this.lastAppliedSequence;
    if (isCurrent) {
      applyMmdRuntimePoseToMesh(pose, this.mesh, this.applyScratch);
      this.lastAppliedSequence = pose.sequence;
      this.copyPoseFrameState(pose);
      this.lastPoseAgeSeconds = Math.max(this.lastRequestedSeconds - pose.seconds, 0);
      this.resolveSettledRequest(requestId, pose.epoch);
    }
    this.recycleCommand.pose = pose;
    this.worker.postMessage(
      this.recycleCommand as MmdRuntimeWorkerCommand,
      [pose.worldMatricesColumnMajor.buffer, pose.morphWeights.buffer]
    );
  }

  private applySharedPose(slotIndex: number, requestId?: number): void {
    const slot = this.sharedPoseSlots?.[slotIndex];
    const target = this.sharedPoseReadBuffer;
    if (!slot || !target) {
      this.activateFallback(new Error(`MMD runtime shared pose slot is invalid: ${slotIndex}`));
      return;
    }
    try {
      const pose = readMmdRuntimeSharedPoseInto(slot, target);
      if (!pose) {
        throw new Error(`MMD runtime shared pose slot is not ready: ${slotIndex}`);
      }
      const isCurrent = pose.epoch === this.currentEpoch && pose.sequence > this.lastAppliedSequence;
      if (isCurrent) {
        applyMmdRuntimePoseToMesh(pose, this.mesh, this.applyScratch);
        this.lastAppliedSequence = pose.sequence;
        this.copyPoseFrameState(pose);
        this.lastPoseAgeSeconds = Math.max(this.lastRequestedSeconds - pose.seconds, 0);
        this.resolveSettledRequest(requestId, pose.epoch);
      }
      releaseMmdRuntimeSharedPoseReadSlot(slot);
      this.post(this.sharedReleaseCommand);
    } catch (error) {
      this.activateFallback(error);
    }
  }

  private activateFallback(error: unknown): void {
    if (this.disposed || this.fallbackRuntime || this.failed) {
      return;
    }
    const failureError = normalizeError(error, "MMD runtime worker failed");
    this.failureError = failureError;
    this.rejectSettledRequests(failureError);
    this.rejectReadyWaiters(failureError);
    if (this.inlineFallbackAllowed) {
      this.fallbackRuntime = new DefaultMmdRuntime(this.runtimeOptions);
      if (this.animation) {
        this.fallbackRuntime.setAnimation(this.animation, this.mesh);
      }
    } else {
      this.failed = true;
    }
    this.ready = false;
    this.onFallback(error);
    this.detachWorker();
    if (this.poolLease) {
      this.poolLease.dispose();
    } else {
      void this.worker.terminate?.();
    }
  }

  private onFallback(error: unknown): void {
    // The callback is supplied through the factory wrapper by assigning it to
    // the private hook below. Keeping this method allocation-free on ticks also
    // makes crash handling independent from the render loop.
    this.fallbackCallback?.(error);
  }

  private fallbackCallback: ((error: unknown) => void) | undefined;

  private attachWorker(worker: MmdRuntimeWorkerLike): void {
    if (worker.addEventListener) {
      worker.addEventListener("message", this.onMessageBound);
      worker.addEventListener("error", this.onErrorBound as never);
      return;
    }
    if (worker.on) {
      worker.on("message", this.onNodeMessageBound);
      worker.on("error", this.onErrorBound as never);
      return;
    }
    worker.onmessage = this.onMessageBound;
    worker.onerror = this.onErrorBound;
  }

  private detachWorker(): void {
    if (this.worker.removeEventListener) {
      this.worker.removeEventListener("message", this.onMessageBound);
      this.worker.removeEventListener("error", this.onErrorBound as never);
    } else if (this.worker.off) {
      this.worker.off("message", this.onNodeMessageBound);
      this.worker.off("error", this.onErrorBound as never);
    } else {
      this.worker.onmessage = undefined;
      this.worker.onerror = undefined;
    }
  }

  private post(command: MmdRuntimeWorkerCommand): void {
    try {
      this.worker.postMessage(command);
    } catch (error) {
      this.activateFallback(error);
    }
  }

  private bumpEpoch(): void {
    this.rejectSettledRequests(new Error("MMD runtime settled request was invalidated by an epoch change"));
    this.currentEpoch += 1;
    this.lastAppliedSequence = -1;
  }

  private allocateRequestId(): number {
    if (this.nextRequestId > Number.MAX_SAFE_INTEGER) {
      if (this.settledRequests.size > 0) {
        throw new Error("MMD runtime worker request id space is exhausted");
      }
      this.nextRequestId = 1;
    }
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return requestId;
  }

  private resolveSettledRequest(requestId: number | undefined, epoch: number): void {
    if (requestId === undefined) {
      return;
    }
    const request = this.settledRequests.get(requestId);
    if (!request || request.epoch !== epoch) {
      return;
    }
    this.settledRequests.delete(requestId);
    this.detachAbortListener(request);
    request.resolve(this.snapshotFrameState());
  }

  private rejectSettledRequest(requestId: number, error: Error): void {
    const request = this.settledRequests.get(requestId);
    if (!request) {
      return;
    }
    this.settledRequests.delete(requestId);
    this.detachAbortListener(request);
    request.reject(error);
  }

  private rejectSettledRequests(error: Error): void {
    for (const [requestId, request] of this.settledRequests) {
      this.settledRequests.delete(requestId);
      this.detachAbortListener(request);
      request.reject(error);
    }
  }

  private detachAbortListener(request: SettledRequest): void {
    if (request.signal && request.onAbort) {
      request.signal.removeEventListener("abort", request.onAbort);
    }
  }

  private resolveReadyWaiters(): void {
    for (let index = 0; index < this.readyWaiters.length; index += 1) {
      this.readyWaiters[index]?.resolve();
    }
    this.readyWaiters.length = 0;
  }

  private rejectReadyWaiters(error: Error): void {
    for (let index = 0; index < this.readyWaiters.length; index += 1) {
      this.readyWaiters[index]?.reject(error);
    }
    this.readyWaiters.length = 0;
  }

  private inactiveError(): Error | undefined {
    if (this.disposed) {
      return new Error("MMD runtime worker is disposed");
    }
    if (this.fallbackRuntime || this.failed) {
      return this.failureError ?? new Error("MMD runtime worker failed");
    }
    return undefined;
  }

  private snapshotFrameState(): MmdFrameState {
    return {
      seconds: this.frameStateScratch.seconds,
      frame: this.frameStateScratch.frame,
      frameRate: this.frameStateScratch.frameRate
    };
  }

  private copyPoseFrameState(pose: MmdRuntimePoseBuffer): void {
    this.frameStateScratch.seconds = pose.seconds;
    this.frameStateScratch.frame = pose.frame;
    this.frameStateScratch.frameRate = pose.frameRate;
  }

  private copyFrameState(state: MmdFrameState): void {
    this.frameStateScratch.seconds = state.seconds;
    this.frameStateScratch.frame = state.frame;
    this.frameStateScratch.frameRate = state.frameRate;
  }

  private assertMesh(mesh: ThreeMmdRuntimeFactoryContext["mesh"]): void {
    if (mesh !== this.mesh) {
      throw new Error("MMD runtime worker mesh does not match its factory context");
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("MMD runtime worker is disposed");
    }
  }
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

function createDefaultWorker(options: WorkerMmdRuntimeOptions): MmdRuntimeWorkerLike {
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

function workerRuntimeOptions(
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

function resolveSharedMemoryMode(mode: NonNullable<WorkerMmdRuntimeOptions["sharedMemory"]>): boolean {
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

interface MutableFrameState {
  seconds: number;
  frame: number;
  frameRate: number;
}

interface MutableEvaluateOptions {
  physics?: boolean;
  ik?: boolean;
}

interface MutableFallbackTickOptions extends MutableEvaluateOptions {
  mesh: THREE.Object3D;
}

function isObject3D(value: unknown): value is THREE.Object3D {
  return Boolean(value && typeof value === "object" && "isObject3D" in value);
}

function normalizeError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(error === undefined ? fallbackMessage : String(error));
}

function createAbortError(): Error {
  const error = new Error("MMD runtime settled request was aborted");
  error.name = "AbortError";
  return error;
}
