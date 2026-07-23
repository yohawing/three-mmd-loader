import { DefaultMmdRuntime } from "../runtime/core.js";
import type {
  DefaultMmdRuntimeOptions,
  MmdFrameState,
  MmdRuntime,
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
import { serializeMmdRuntimeModelDescriptor } from "./modelDescriptor.js";
import type { MmdRuntimePoseBuffer } from "./protocol.js";

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
}

export interface WorkerMmdRuntimeFactoryOptions extends WorkerMmdRuntimeOptions {
  readonly fallback?: boolean;
}

interface MutableWorkerCommand {
  type: "setAnimation" | "tick" | "seek" | "resetPose" | "clearAnimation";
  epoch: number;
  animation?: MmdAnimation;
  seconds?: number;
  options?: MmdRuntimeEvaluateOptions;
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
  private readonly recycleCommand = {
    type: "recycle" as const,
    pose: undefined as unknown as MmdRuntimePoseBuffer
  };
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
  private fallbackRuntime: DefaultMmdRuntime | undefined;
  private animation: MmdAnimation | undefined;
  private currentEpoch = 0;
  private lastAppliedSequence = -1;
  private lastPoseAgeSeconds = 0;
  private lastRequestedSeconds = 0;
  private ready = false;
  private disposed = false;

  constructor(
    context: ThreeMmdRuntimeFactoryContext,
    options: WorkerMmdRuntimeOptions = {}
  ) {
    this.mesh = context.mesh;
    this.runtimeOptions = options.runtimeOptions ?? {};
    this.fallbackCallback = options.onFallback;
    this.applyScratch = createMmdRuntimePoseApplyScratch(this.mesh);
    this.worker = options.workerFactory
      ? options.workerFactory(context)
      : createDefaultWorker(options);
    if (!this.worker) {
      throw new Error("MMD runtime worker is unavailable");
    }
    this.attachWorker(this.worker);
    const descriptor = serializeMmdRuntimeModelDescriptor(this.mesh);
    this.worker.postMessage({
      type: "init",
      descriptor,
      runtimeOptions: workerRuntimeOptions(this.runtimeOptions)
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
      const state = this.fallbackRuntime.tick(seconds, { mesh: this.mesh, ...options });
      this.copyFrameState(state);
      this.lastPoseAgeSeconds = 0;
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
    return { ...this.frameStateScratch };
  }

  debugState(): MmdRuntimeDebugState {
    return this.fallbackRuntime?.debugState() ?? emptyDebugState;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.fallbackRuntime) {
      this.fallbackRuntime.clearAnimation();
    } else {
      this.worker.postMessage({ type: "dispose" });
    }
    this.detachWorker();
    void this.worker.terminate?.();
  }

  private handleEvent(event: MmdRuntimeWorkerEvent): void {
    if (this.disposed) {
      return;
    }
    if (event.type === "ready") {
      this.ready = true;
      return;
    }
    if (event.type === "pose") {
      this.applyPose(event.pose);
      return;
    }
    if (event.type === "error") {
      this.activateFallback(new Error(event.message));
    }
  }

  private applyPose(pose: MmdRuntimePoseBuffer): void {
    const isCurrent = pose.epoch === this.currentEpoch && pose.sequence > this.lastAppliedSequence;
    if (isCurrent) {
      applyMmdRuntimePoseToMesh(pose, this.mesh, this.applyScratch);
      this.lastAppliedSequence = pose.sequence;
      this.copyPoseFrameState(pose);
      this.lastPoseAgeSeconds = Math.max(this.lastRequestedSeconds - pose.seconds, 0);
    }
    this.recycleCommand.pose = pose;
    this.worker.postMessage(
      this.recycleCommand as MmdRuntimeWorkerCommand,
      [pose.worldMatricesColumnMajor.buffer, pose.morphWeights.buffer]
    );
  }

  private activateFallback(error: unknown): void {
    if (this.disposed || this.fallbackRuntime) {
      return;
    }
    this.fallbackRuntime = new DefaultMmdRuntime(this.runtimeOptions);
    if (this.animation) {
      this.fallbackRuntime.setAnimation(this.animation, this.mesh);
    }
    this.ready = false;
    this.onFallback(error);
    this.detachWorker();
    void this.worker.terminate?.();
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
    this.currentEpoch += 1;
    this.lastAppliedSequence = -1;
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
): (context: ThreeMmdRuntimeFactoryContext) => MmdRuntime {
  return (context) => {
    try {
      if (options.runtimeOptions?.physics === "external") {
        throw new Error("MMD runtime worker does not support external physics");
      }
      const runtime = new WorkerMmdRuntime(context, options);
      return runtime;
    } catch (error) {
      options.onFallback?.(error);
      if (options.fallback === false) {
        throw error;
      }
      return new DefaultMmdRuntime(options.runtimeOptions);
    }
  };
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
    physics: options.physics === "external" ? "none" : options.physics,
    ikTolerance: options.ikTolerance,
    ikMaxIterationsCap: options.ikMaxIterationsCap
  };
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

function isObject3D(value: unknown): value is THREE.Object3D {
  return Boolean(value && typeof value === "object" && "isObject3D" in value);
}
