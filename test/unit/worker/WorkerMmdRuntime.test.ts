import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import { DefaultMmdRuntime } from "../../../src/runtime/index.js";
import {
  createMmdRuntimePoseBuffer,
  acquireMmdRuntimeSharedPoseWriteSlot,
  createWorkerMmdRuntimeFactory,
  publishMmdRuntimeSharedPose,
  type MmdRuntimeWorkerEvent,
  type MmdRuntimeWorkerCommand,
  type MmdRuntimeWorkerLike,
  type WorkerMmdRuntime
} from "../../../src/worker/index.js";

describe("WorkerMmdRuntime", () => {
  it("crosses a real worker_threads boundary and applies asynchronous poses", async () => {
    const workerUrl = resolve("dist/worker/node-entry.js");
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        runtimeOptions: { physics: "none" },
        workerFactory: () => new Worker(workerUrl, { type: "module" }) as unknown as MmdRuntimeWorkerLike
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const animation = await loader.loadAnimation(
      await readFile(resolve("test/fixtures/test_1bone_cube_motion.vmd"))
    );
    const runtime = model.runtime as WorkerMmdRuntime;
    model.setAnimation(animation.animation);
    await runtime.whenReady();
    const settled = await model.updateAsync(0.2, { physics: false });
    expect(settled.seconds).toBe(0.2);
    expect(runtime.workerReady()).toBe(true);
    expect(runtime.poseAgeSeconds()).toBeGreaterThanOrEqual(0);
    expect(runtime.poseAgeFrames()).toBeGreaterThanOrEqual(0);
    expect(model.mesh.skeleton.bones[0]?.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    runtime.dispose();
    expect(() => runtime.tick(0.3, { physics: false })).toThrow("disposed");
  });

  it("provides updateAsync for synchronous runtimes", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const state = await model.updateAsync(0.25, { physics: false });
    expect(state).toEqual({ seconds: 0.25, frame: 7.5, frameRate: 30 });
    expect(model.runtime.tickAsync).toBeUndefined();
    model.update(0.5, { physics: false });
    expect(state.seconds).toBe(0.25);
  });

  it("resolves a settled request only after its transferable pose is applied", async () => {
    let transport: ManualWorker | undefined;
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        workerFactory: () => {
          transport = new ManualWorker();
          return transport;
        }
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const runtime = model.runtime as WorkerMmdRuntime;
    await runtime.whenReady();
    const pending = model.updateAsync(0.25, { physics: false });
    const tick = transport?.lastSettledTick();
    if (!tick?.requestId || !transport?.descriptor) {
      throw new Error("Expected a settled worker tick");
    }
    expect(runtime.frameState().seconds).toBe(0);
    const pose = createMmdRuntimePoseBuffer(
      transport.descriptor.bones.length,
      transport.descriptor.morphCount
    );
    pose.worldMatricesColumnMajor[0] = 1;
    pose.worldMatricesColumnMajor[5] = 1;
    pose.worldMatricesColumnMajor[10] = 1;
    pose.worldMatricesColumnMajor[12] = 2;
    pose.worldMatricesColumnMajor[15] = 1;
    Object.assign(pose, { epoch: 0, sequence: 1, seconds: 0.25, frame: 7.5 });
    transport.emit({ type: "pose", pose, requestId: tick.requestId });

    await expect(pending).resolves.toEqual({ seconds: 0.25, frame: 7.5, frameRate: 30 });
    expect(runtime.frameState().seconds).toBe(0.25);
    expect(model.mesh.skeleton.bones[0]?.matrixWorld.elements[12]).toBeCloseTo(2);
    expect(transport.recycleCount).toBe(1);
    runtime.dispose();
  });

  it("rejects settled requests on abort, epoch change, and crash", async () => {
    let transport: ManualWorker | undefined;
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        fallback: false,
        workerFactory: () => {
          transport = new ManualWorker();
          return transport;
        }
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const animation = await loader.loadAnimation(
      await readFile(resolve("test/fixtures/test_1bone_cube_motion.vmd"))
    );
    const runtime = model.runtime as WorkerMmdRuntime;

    const controller = new AbortController();
    const aborted = model.updateAsync(0.1, { signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });

    const invalidated = model.updateAsync(0.2);
    model.setAnimation(animation.animation);
    await expect(invalidated).rejects.toThrow("epoch change");

    const crashed = model.updateAsync(0.3);
    transport?.crash(new Error("worker crashed"));
    await expect(crashed).rejects.toThrow("worker crashed");

    runtime.dispose();
    expect(() => runtime.tickAsync(0.4)).toThrow("disposed");
  });

  it("rejects a pending settled request on dispose", async () => {
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        fallback: false,
        workerFactory: () => new ManualWorker()
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const runtime = model.runtime as WorkerMmdRuntime;
    const pending = model.updateAsync(0.25);
    runtime.dispose();
    await expect(pending).rejects.toThrow("disposed");
  });

  it("rejects readiness when a worker fails before becoming ready", async () => {
    let transport: CrashableWorker | undefined;
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        fallback: false,
        workerFactory: () => {
          transport = new CrashableWorker();
          return transport;
        }
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const runtime = model.runtime as WorkerMmdRuntime;
    const ready = runtime.whenReady();
    transport?.crash(new Error("worker init failed"));
    await expect(ready).rejects.toThrow("worker init failed");
  });

  it("falls back to DefaultMmdRuntime when the worker cannot be created", async () => {
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        workerFactory: () => {
          throw new Error("worker unavailable");
        }
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    expect(model.runtime).toBeInstanceOf(DefaultMmdRuntime);
  });

  it("switches to inline runtime after a worker crash and preserves animation binding", async () => {
    let transport: CrashableWorker | undefined;
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        workerFactory: () => {
          transport = new CrashableWorker();
          return transport;
        }
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const animation = await loader.loadAnimation(
      await readFile(resolve("test/fixtures/test_1bone_cube_motion.vmd"))
    );
    const runtime = model.runtime as WorkerMmdRuntime;
    model.setAnimation(animation.animation);
    transport?.crash(new Error("worker crashed"));
    model.update(0.15, { physics: false });
    expect(runtime.workerReady()).toBe(false);
    expect(runtime.poseAgeSeconds()).toBe(0);
    runtime.dispose();
  });

  it("does not inline-fallback after a worker crash when fallback is disabled", async () => {
    let transport: CrashableWorker | undefined;
    const fallbackErrors: unknown[] = [];
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        fallback: false,
        onFallback: (error) => fallbackErrors.push(error),
        workerFactory: () => {
          transport = new CrashableWorker();
          return transport;
        }
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const runtime = model.runtime as WorkerMmdRuntime;

    transport?.crash(new Error("worker crashed"));
    model.update(0.15, { physics: false });

    expect(fallbackErrors).toEqual([expect.objectContaining({ message: "worker crashed" })]);
    expect(runtime.frameState().seconds).toBe(0);
    expect(runtime.poseAgeSeconds()).toBe(0.15);
    runtime.dispose();
  });

  it("does not continue external physics without an inline backend after a crash", async () => {
    let transport: CrashableWorker | undefined;
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        runtimeOptions: { physics: "external" },
        externalPhysics: { kind: "custom-bullet-mmd" },
        workerFactory: () => {
          transport = new CrashableWorker();
          return transport;
        }
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const runtime = model.runtime as WorkerMmdRuntime;

    transport?.crash(new Error("worker crashed"));
    model.update(0.2);

    expect(runtime.frameState().seconds).toBe(0);
    expect(runtime.poseAgeSeconds()).toBe(0.2);
    runtime.dispose();
  });

  it("rejects a pose from an older epoch before applying the current pose", async () => {
    let transport: ManualWorker | undefined;
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        workerFactory: () => {
          transport = new ManualWorker();
          return transport;
        }
      })
    });
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
      { outline: false, materialRenderOrder: false }
    );
    const animation = await loader.loadAnimation(
      await readFile(resolve("test/fixtures/test_1bone_cube_motion.vmd"))
    );
    const runtime = model.runtime as WorkerMmdRuntime;
    model.setAnimation(animation.animation);
    const descriptor = transport?.descriptor;
    if (!descriptor) {
      throw new Error("Expected worker init descriptor");
    }
    const stale = createMmdRuntimePoseBuffer(descriptor.bones.length, descriptor.morphCount);
    Object.assign(stale, { epoch: 0, sequence: 99, seconds: 0.9 });
    transport?.emit({ type: "pose", pose: stale });
    expect(runtime.frameState().seconds).toBe(0);
    const current = createMmdRuntimePoseBuffer(descriptor.bones.length, descriptor.morphCount);
    Object.assign(current, { epoch: 1, sequence: 1, seconds: 0.25, frame: 7.5 });
    transport?.emit({ type: "pose", pose: current });
    expect(runtime.frameState().seconds).toBe(0.25);
    runtime.dispose();
  });

  it("uses shared pose slots when cross-origin isolation is available", async () => {
    let transport: ManualWorker | undefined;
    const loader = new ThreeMmdLoader({
      runtimeFactory: createWorkerMmdRuntimeFactory({
        sharedMemory: "required",
        workerFactory: () => {
          transport = new ManualWorker();
          return transport;
        }
      })
    });
    const originalIsolation = globalThis.crossOriginIsolated;
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      value: true,
      configurable: true
    });
    try {
      const model = await loader.loadModel(
        await readFile(resolve("test/fixtures/test_1bone_cube.pmx")),
        { outline: false, materialRenderOrder: false }
      );
      const runtime = model.runtime as WorkerMmdRuntime;
      expect(runtime.sharedMemoryEnabled()).toBe(true);
      const pending = model.updateAsync(0.5);
      const tick = transport?.lastSettledTick();
      if (!tick?.requestId) {
        throw new Error("Expected a settled shared-memory tick");
      }
      const slot = acquireMmdRuntimeSharedPoseWriteSlot(transport?.sharedPoseSlots ?? []);
      if (!slot) {
        throw new Error("Expected a writable shared pose slot");
      }
      const source = createMmdRuntimePoseBuffer(model.mesh.skeleton.bones.length, 0);
      Object.assign(source, { epoch: 0, sequence: 2, seconds: 0.5, frame: 15 });
      publishMmdRuntimeSharedPose(slot, source);
      transport?.emit({ type: "sharedPose", slot: 0, requestId: tick.requestId });
      await expect(pending).resolves.toEqual({ seconds: 0.5, frame: 15, frameRate: 30 });
      expect(runtime.frameState().seconds).toBe(0.5);
      expect(transport?.sharedReleaseCount).toBe(1);
      runtime.dispose();
    } finally {
      Object.defineProperty(globalThis, "crossOriginIsolated", {
        value: originalIsolation,
        configurable: true
      });
    }
  });
});

class CrashableWorker implements MmdRuntimeWorkerLike {
  private errorListener: ((error: unknown) => void) | undefined;

  on(type: string, listener: (event: MmdRuntimeWorkerEvent) => void): void {
    if (type === "error") {
      this.errorListener = listener as unknown as (error: unknown) => void;
    }
  }

  off(): void {
    this.errorListener = undefined;
  }

  postMessage(): void {
    // The test only exercises crash fallback; endpoint behavior is covered by
    // WorkerEndpoint.test.ts and the worker_threads case above.
  }

  terminate(): void {
    // No real worker to terminate.
  }

  crash(error: unknown): void {
    this.errorListener?.(error);
  }
}

class ManualWorker implements MmdRuntimeWorkerLike {
  descriptor: Extract<MmdRuntimeWorkerCommand, { type: "init" }>["descriptor"] | undefined;
  sharedPoseSlots: Extract<MmdRuntimeWorkerCommand, { type: "init" }>["sharedPoseSlots"];
  sharedReleaseCount = 0;
  recycleCount = 0;
  readonly commands: MmdRuntimeWorkerCommand[] = [];
  private messageListener: ((event: MmdRuntimeWorkerEvent) => void) | undefined;
  private errorListener: ((error: unknown) => void) | undefined;

  on(type: string, listener: (event: MmdRuntimeWorkerEvent) => void): void {
    if (type === "message") {
      this.messageListener = listener;
    } else if (type === "error") {
      this.errorListener = listener as unknown as (error: unknown) => void;
    }
  }

  off(): void {
    this.messageListener = undefined;
    this.errorListener = undefined;
  }

  postMessage(message: MmdRuntimeWorkerCommand): void {
    const command = "command" in message
      ? (message as unknown as { command: MmdRuntimeWorkerCommand }).command
      : message;
    this.commands.push(structuredClone(command));
    if (command.type === "init") {
      this.descriptor = command.descriptor;
      this.sharedPoseSlots = command.sharedPoseSlots;
      this.messageListener?.({ type: "ready", epoch: 0 });
    } else if (command.type === "sharedRelease") {
      this.sharedReleaseCount += 1;
    } else if (command.type === "recycle") {
      this.recycleCount += 1;
    }
  }

  terminate(): void {
    this.messageListener = undefined;
  }

  emit(event: MmdRuntimeWorkerEvent): void {
    this.messageListener?.(event);
  }

  crash(error: unknown): void {
    this.errorListener?.(error);
  }

  lastSettledTick(): Extract<MmdRuntimeWorkerCommand, { type: "tick" }> | undefined {
    for (let index = this.commands.length - 1; index >= 0; index -= 1) {
      const command = this.commands[index];
      if (command?.type === "tick" && command.requestId !== undefined) {
        return command;
      }
    }
    return undefined;
  }
}
