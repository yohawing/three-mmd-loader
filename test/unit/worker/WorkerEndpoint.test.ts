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
});

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
