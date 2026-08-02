import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import {
  createMmdRuntimeSharedPoseReadBuffer,
  createMmdRuntimeSharedPoseSlots,
  MmdRuntimeWorkerEndpoint,
  readMmdRuntimeSharedPoseInto,
  releaseMmdRuntimeSharedPoseReadSlot,
  serializeMmdRuntimeModelDescriptor
} from "../../../src/worker/index.js";
import type {
  MmdRuntimeWorkerEvent,
  MmdRuntimeWorkerMessagePort
} from "../../../src/worker/index.js";
import type {
  MmdPhysicsBackend,
  MmdPhysicsStepContext,
  MmdPhysicsStepResult
} from "../../../src/physics/index.js";

describe("MMD runtime worker endpoint", () => {
  it("queues before ready, coalesces ticks, recycles buffers, and disposes", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_append_bone.pmx"))
    );
    const animation = await loader.loadAnimation(
      await readFile(resolve("test/fixtures/test_append_bone.vmd"))
    );
    const port = new TransferEmulatingPort();
    const endpoint = new MmdRuntimeWorkerEndpoint(port);

    endpoint.handle({ type: "setAnimation", epoch: 1, animation: animation.animation });
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh)
    });
    expect(port.events[0]).toEqual({ type: "ready", epoch: 0 });

    endpoint.handle({ type: "tick", epoch: 1, seconds: 0 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.1 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.2 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.3 });
    const initialPoseEvents = port.poseEvents();
    expect(initialPoseEvents.map((event) => event.pose.seconds)).toEqual([0, 0.1, 0.2]);

    const recycled = initialPoseEvents[0]?.pose;
    if (!recycled) {
      throw new Error("Expected transferable pose event");
    }
    endpoint.handle({ type: "recycle", pose: recycled });
    expect(port.poseEvents()).toHaveLength(4);
    expect(port.poseEvents().at(-1)?.pose.seconds).toBe(0.3);

    const eventCount = port.events.length;
    endpoint.handle({ type: "tick", epoch: 0, seconds: 99 });
    expect(port.events).toHaveLength(eventCount);
    endpoint.handle({ type: "dispose" });
    expect(port.events.at(-1)).toEqual({ type: "disposed" });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 1 });
    expect(port.events.at(-1)).toEqual({ type: "disposed" });
  });

  it("reports invalid epoch command ordering", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const port = new TransferEmulatingPort();
    const endpoint = new MmdRuntimeWorkerEndpoint(port);
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh)
    });
    endpoint.handle({ type: "resetPose", epoch: 9 });
    expect(port.events.at(-1)).toEqual({
      type: "error",
      message: "MMD runtime worker epoch mismatch: expected 9, actual 1"
    });
  });

  it("preserves settled ticks and prioritizes them over the latest streaming tick", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const animation = await loader.loadAnimation(
      await readFile(resolve("test/fixtures/test_1bone_cube_motion.vmd"))
    );
    const port = new TransferEmulatingPort();
    const endpoint = new MmdRuntimeWorkerEndpoint(port);
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh)
    });
    endpoint.handle({ type: "setAnimation", epoch: 1, animation: animation.animation });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.1 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.2 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.3, requestId: 1 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.4, requestId: 2 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.5 });

    const occupied = port.poseEvents().slice(0, 3);
    expect(occupied).toHaveLength(3);
    for (const poseEvent of occupied) {
      endpoint.handle({ type: "recycle", pose: poseEvent.pose });
    }

    const resumed = port.poseEvents().slice(3);
    expect(resumed.map((event) => [event.pose.seconds, event.requestId])).toEqual([
      [0.3, 1],
      [0.4, 2],
      [0.5, undefined]
    ]);
  });

  it("does not publish a queued settled tick after an epoch change", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const port = new TransferEmulatingPort();
    const endpoint = new MmdRuntimeWorkerEndpoint(port);
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh)
    });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.1 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.2 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.3, requestId: 1 });
    endpoint.handle({ type: "seek", epoch: 1, seconds: 1 });

    const firstPose = port.poseEvents()[0]?.pose;
    if (!firstPose) {
      throw new Error("Expected an occupied transferable pose");
    }
    endpoint.handle({ type: "recycle", pose: firstPose });
    expect(port.poseEvents()).toHaveLength(3);
  });

  it("bounds the settled queue when transferable buffers are exhausted", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const port = new TransferEmulatingPort();
    const endpoint = new MmdRuntimeWorkerEndpoint(port);
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh)
    });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.1 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.2 });
    for (let requestId = 1; requestId <= 33; requestId += 1) {
      endpoint.handle({ type: "tick", epoch: 0, seconds: 1 + requestId / 60, requestId });
    }
    expect(port.events.at(-1)).toEqual({
      type: "error",
      message: "MMD runtime worker settled queue overflow"
    });
  });

  it("publishes through shared slots and resumes the latest tick after release", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_append_bone.pmx"))
    );
    const animation = await loader.loadAnimation(
      await readFile(resolve("test/fixtures/test_append_bone.vmd"))
    );
    const port = new TransferEmulatingPort();
    const endpoint = new MmdRuntimeWorkerEndpoint(port);
    const slots = createMmdRuntimeSharedPoseSlots(model.mesh.skeleton.bones.length, 0);
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh),
      sharedPoseSlots: structuredClone(slots)
    });
    endpoint.handle({ type: "setAnimation", epoch: 1, animation: animation.animation });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.1 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.2 });
    endpoint.handle({ type: "tick", epoch: 1, seconds: 0.3 });

    const sharedEvents = port.events.filter(
      (event): event is Extract<MmdRuntimeWorkerEvent, { readonly type: "sharedPose" }> =>
        event.type === "sharedPose"
    );
    expect(sharedEvents.map((event) => event.slot)).toEqual([0, 1, 2]);
    const firstSlot = slots[0];
    if (!firstSlot) {
      throw new Error("Expected a shared pose slot");
    }
    const pose = createMmdRuntimeSharedPoseReadBuffer(model.mesh.skeleton.bones.length, 0);
    expect(readMmdRuntimeSharedPoseInto(firstSlot, pose)?.seconds).toBe(0);
    releaseMmdRuntimeSharedPoseReadSlot(firstSlot);
    endpoint.handle({ type: "sharedRelease" });
    expect(port.events.at(-1)).toEqual({ type: "sharedPose", slot: 0 });
    expect(readMmdRuntimeSharedPoseInto(firstSlot, pose)?.seconds).toBe(0.3);
  });

  it("carries settled request ids through shared pose events", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const port = new TransferEmulatingPort();
    const endpoint = new MmdRuntimeWorkerEndpoint(port);
    const slots = createMmdRuntimeSharedPoseSlots(model.mesh.skeleton.bones.length, 0);
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh),
      sharedPoseSlots: structuredClone(slots)
    });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.1 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.2 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.3, requestId: 7 });

    const firstSlot = slots[0];
    if (!firstSlot) {
      throw new Error("Expected a shared pose slot");
    }
    const pose = createMmdRuntimeSharedPoseReadBuffer(model.mesh.skeleton.bones.length, 0);
    expect(readMmdRuntimeSharedPoseInto(firstSlot, pose)?.seconds).toBe(0);
    releaseMmdRuntimeSharedPoseReadSlot(firstSlot);
    endpoint.handle({ type: "sharedRelease" });
    expect(port.events.at(-1)).toEqual({ type: "sharedPose", slot: 0, requestId: 7 });
  });

  it("initializes and disposes an external backend owned by the worker", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const port = new TransferEmulatingPort();
    const backend = new RecordingPhysicsBackend();
    const endpoint = new MmdRuntimeWorkerEndpoint(port, {
      createExternalPhysicsBackend: async () => backend
    });
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh),
      runtimeOptions: { physics: "external" },
      externalPhysics: { kind: "custom-bullet-mmd" }
    });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.25 });
    await Promise.resolve();
    expect(port.events[0]).toEqual({ type: "ready", epoch: 0 });
    expect(port.poseEvents().at(-1)?.pose.seconds).toBe(0.25);
    endpoint.handle({ type: "dispose" });
    expect(backend.disposeCount).toBe(1);
  });

  it("coalesces ticks while an external backend initializes", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const port = new TransferEmulatingPort();
    const backend = new RecordingPhysicsBackend();
    let resolveBackend: ((backend: MmdPhysicsBackend) => void) | undefined;
    const endpoint = new MmdRuntimeWorkerEndpoint(port, {
      createExternalPhysicsBackend: () => new Promise((resolvePromise) => {
        resolveBackend = resolvePromise;
      })
    });
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh),
      runtimeOptions: { physics: "external" },
      externalPhysics: { kind: "custom-bullet-mmd" }
    });
    for (let index = 0; index < 64; index += 1) {
      endpoint.handle({ type: "tick", epoch: 0, seconds: index / 60 });
    }

    expect(port.events).toEqual([]);
    resolveBackend?.(backend);
    await Promise.resolve();

    expect(port.events[0]).toEqual({ type: "ready", epoch: 0 });
    expect(port.poseEvents()).toHaveLength(1);
    expect(port.poseEvents()[0]?.pose.seconds).toBe(63 / 60);
  });

  it("preserves settled ticks while an external backend initializes", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const port = new TransferEmulatingPort();
    const backend = new RecordingPhysicsBackend();
    let resolveBackend: ((backend: MmdPhysicsBackend) => void) | undefined;
    const endpoint = new MmdRuntimeWorkerEndpoint(port, {
      createExternalPhysicsBackend: () => new Promise((resolvePromise) => {
        resolveBackend = resolvePromise;
      })
    });
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh),
      runtimeOptions: { physics: "external" },
      externalPhysics: { kind: "custom-bullet-mmd" }
    });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.1, requestId: 1 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.2, requestId: 2 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.3 });
    endpoint.handle({ type: "tick", epoch: 0, seconds: 0.4 });

    resolveBackend?.(backend);
    await Promise.resolve();

    expect(port.poseEvents().map((event) => [event.pose.seconds, event.requestId])).toEqual([
      [0.1, 1],
      [0.2, 2],
      [0.4, undefined]
    ]);
  });

  it("disposes an external backend that resolves after the endpoint", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const port = new TransferEmulatingPort();
    const backend = new RecordingPhysicsBackend();
    let resolveBackend: ((backend: MmdPhysicsBackend) => void) | undefined;
    const endpoint = new MmdRuntimeWorkerEndpoint(port, {
      createExternalPhysicsBackend: () => new Promise((resolvePromise) => {
        resolveBackend = resolvePromise;
      })
    });
    endpoint.handle({
      type: "init",
      descriptor: serializeMmdRuntimeModelDescriptor(model.mesh),
      runtimeOptions: { physics: "external" },
      externalPhysics: { kind: "custom-bullet-mmd" }
    });
    endpoint.handle({ type: "dispose" });
    resolveBackend?.(backend);
    await Promise.resolve();
    expect(backend.disposeCount).toBe(1);
    expect(port.events).toEqual([{ type: "disposed" }]);
  });
});

class RecordingPhysicsBackend implements MmdPhysicsBackend {
  readonly name = "recording";
  readonly disabled = false;
  disposeCount = 0;

  get disposed(): boolean {
    return this.disposeCount > 0;
  }

  step(_context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    return { simulated: true };
  }

  dispose(): void {
    this.disposeCount += 1;
  }
}

class TransferEmulatingPort implements MmdRuntimeWorkerMessagePort {
  readonly events: MmdRuntimeWorkerEvent[] = [];

  postMessage(message: MmdRuntimeWorkerEvent, transfer: Transferable[] = []): void {
    this.events.push(structuredClone(message, { transfer }));
  }

  poseEvents(): Array<Extract<MmdRuntimeWorkerEvent, { readonly type: "pose" }>> {
    return this.events.filter(
      (event): event is Extract<MmdRuntimeWorkerEvent, { readonly type: "pose" }> =>
        event.type === "pose"
    );
  }
}
