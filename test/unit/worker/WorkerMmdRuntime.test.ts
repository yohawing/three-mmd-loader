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
    model.update(0.2, { physics: false });
    await waitFor(() => runtime.frameState().seconds >= 0.2);
    expect(runtime.workerReady()).toBe(true);
    expect(runtime.poseAgeSeconds()).toBeGreaterThanOrEqual(0);
    expect(runtime.poseAgeFrames()).toBeGreaterThanOrEqual(0);
    expect(model.mesh.skeleton.bones[0]?.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    runtime.dispose();
    expect(() => runtime.tick(0.3, { physics: false })).toThrow("disposed");
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
      const slot = acquireMmdRuntimeSharedPoseWriteSlot(transport?.sharedPoseSlots ?? []);
      if (!slot) {
        throw new Error("Expected a writable shared pose slot");
      }
      const source = createMmdRuntimePoseBuffer(model.mesh.skeleton.bones.length, 0);
      Object.assign(source, { epoch: 0, sequence: 2, seconds: 0.5, frame: 15 });
      publishMmdRuntimeSharedPose(slot, source);
      transport?.emit({ type: "sharedPose", slot: 0 });
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
  private messageListener: ((event: MmdRuntimeWorkerEvent) => void) | undefined;

  on(type: string, listener: (event: MmdRuntimeWorkerEvent) => void): void {
    if (type === "message") {
      this.messageListener = listener;
    }
  }

  off(): void {
    this.messageListener = undefined;
  }

  postMessage(message: MmdRuntimeWorkerCommand): void {
    if (message.type === "init") {
      this.descriptor = message.descriptor;
      this.sharedPoseSlots = message.sharedPoseSlots;
      this.messageListener?.({ type: "ready", epoch: 0 });
    } else if (message.type === "sharedRelease") {
      this.sharedReleaseCount += 1;
    }
  }

  terminate(): void {
    this.messageListener = undefined;
  }

  emit(event: MmdRuntimeWorkerEvent): void {
    this.messageListener?.(event);
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for worker pose");
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}
