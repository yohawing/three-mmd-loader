import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import { MmdRuntimeWorkerDispatcher } from "../../../src/worker/dispatcher.js";
import { serializeMmdRuntimeModelDescriptor } from "../../../src/worker/modelDescriptor.js";
import type {
  MmdRuntimeWorkerCommandEnvelope,
  MmdRuntimeWorkerEventEnvelope,
  MmdRuntimeWorkerEvent,
  MmdRuntimeWorkerMultiplexedMessagePort
} from "../../../src/worker/messages.js";

describe("MMD runtime worker dispatcher", () => {
  it("keeps epochs, pose pools, and disposal independent per runtime", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_append_bone.pmx"))
    );
    const animation = await loader.loadAnimation(
      await readFile(resolve("test/fixtures/test_append_bone.vmd"))
    );
    const port = new RecordingPort();
    const dispatcher = new MmdRuntimeWorkerDispatcher(port);
    const descriptor = serializeMmdRuntimeModelDescriptor(model.mesh);

    dispatcher.handle({ runtimeId: 11, command: { type: "init", descriptor } });
    dispatcher.handle({ runtimeId: 22, command: { type: "init", descriptor } });
    expect(dispatcher.runtimeCount()).toBe(2);

    dispatcher.handle({
      runtimeId: 11,
      command: { type: "setAnimation", epoch: 1, animation: animation.animation }
    });
    dispatcher.handle({
      runtimeId: 11,
      command: { type: "tick", epoch: 1, seconds: 0 }
    });
    dispatcher.handle({
      runtimeId: 22,
      command: { type: "tick", epoch: 0, seconds: 0.25 }
    });

    const firstPoses = port.poseEvents();
    expect(firstPoses.map((entry) => entry.runtimeId)).toEqual([11, 22]);
    expect(firstPoses.map((entry) => entry.event.pose.epoch)).toEqual([1, 0]);
    expect(firstPoses.map((entry) => entry.event.pose.sequence)).toEqual([3, 2]);
    expect(port.poseTransfers()).toHaveLength(2);

    // Exhaust runtime 11's pool; recycling its pose must only resume runtime 11.
    dispatcher.handle({
      runtimeId: 11,
      command: { type: "tick", epoch: 1, seconds: 0.1 }
    });
    dispatcher.handle({
      runtimeId: 11,
      command: { type: "tick", epoch: 1, seconds: 0.2 }
    });
    dispatcher.handle({
      runtimeId: 11,
      command: { type: "tick", epoch: 1, seconds: 0.3 }
    });
    const runtime11Poses = port.poseEvents().filter((entry) => entry.runtimeId === 11);
    expect(runtime11Poses.map((entry) => entry.event.pose.seconds)).toEqual([0, 0.1, 0.2]);

    const runtime11FirstPose = runtime11Poses[0]?.event.pose;
    if (!runtime11FirstPose) {
      throw new Error("Expected a runtime 11 pose");
    }
    dispatcher.handle({
      runtimeId: 11,
      command: { type: "recycle", pose: runtime11FirstPose }
    });
    expect(port.poseEvents().at(-1)?.runtimeId).toBe(11);
    expect(port.poseEvents().at(-1)?.event.pose.seconds).toBe(0.3);

    dispatcher.handle({
      runtimeId: 22,
      command: { type: "tick", epoch: 0, seconds: 0.5 }
    });
    expect(port.poseEvents().at(-1)?.runtimeId).toBe(22);
    expect(port.poseEvents().at(-1)?.event.pose.seconds).toBe(0.5);

    dispatcher.handle({ runtimeId: 11, command: { type: "dispose" } });
    expect(dispatcher.runtimeCount()).toBe(1);
    dispatcher.handle({
      runtimeId: 22,
      command: { type: "tick", epoch: 0, seconds: 0.75 }
    });
    expect(port.poseEvents().at(-1)?.runtimeId).toBe(22);
    expect(port.poseEvents().at(-1)?.event.pose.seconds).toBe(0.75);
  });

  it("creates only on init and reports duplicate or unknown runtime ids", async () => {
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(
      await readFile(resolve("test/fixtures/test_1bone_cube.pmx"))
    );
    const port = new RecordingPort();
    const dispatcher = new MmdRuntimeWorkerDispatcher(port);
    const descriptor = serializeMmdRuntimeModelDescriptor(model.mesh);

    dispatcher.handle({
      runtimeId: 99,
      command: { type: "tick", epoch: 0, seconds: 0 }
    });
    expect(port.events.at(-1)).toMatchObject({
      runtimeId: 99,
      event: { type: "error" }
    });

    const init: MmdRuntimeWorkerCommandEnvelope = {
      runtimeId: 99,
      command: { type: "init", descriptor }
    };
    dispatcher.handle(init);
    expect(port.events.at(-1)).toMatchObject({ runtimeId: 99, event: { type: "ready" } });
    dispatcher.handle(init);
    expect(port.events.at(-1)).toMatchObject({
      runtimeId: 99,
      event: {
        type: "error",
        message: "MMD runtime worker runtime 99 is already initialized"
      }
    });

    dispatcher.handle({
      runtimeId: 123,
      command: {
        type: "init",
        descriptor: { ...descriptor, version: 2 as 1 }
      }
    });
    expect(dispatcher.runtimeCount()).toBe(1);
    expect(port.events.at(-1)).toMatchObject({
      runtimeId: 123,
      event: { type: "error" }
    });

    const rejectingModule = "data:text/javascript,export default async()=>{throw new Error('init failed')}";
    dispatcher.handle({
      runtimeId: 456,
      command: {
        type: "init",
        descriptor,
        runtimeOptions: { physics: "external" },
        externalPhysics: {
          kind: "custom-bullet-mmd",
          moduleUrl: rejectingModule
        }
      }
    });
    await waitFor(() => port.events.some(
      (entry) => entry.runtimeId === 456 && entry.event.type === "error"
    ));
    expect(dispatcher.runtimeCount()).toBe(1);
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for dispatcher event");
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
}

class RecordingPort implements MmdRuntimeWorkerMultiplexedMessagePort {
  readonly events: MmdRuntimeWorkerEventEnvelope[] = [];
  private readonly transfers: Transferable[][] = [];

  postMessage(message: MmdRuntimeWorkerEventEnvelope, transfer?: Transferable[]): void {
    this.events.push(
      transfer ? structuredClone(message, { transfer }) : structuredClone(message)
    );
    if (transfer) {
      this.transfers.push(transfer);
    }
  }

  poseEvents(): PoseEventEnvelope[] {
    return this.events.filter(
      (entry): entry is PoseEventEnvelope =>
        entry.event.type === "pose"
    );
  }

  poseTransfers(): Transferable[][] {
    return this.transfers;
  }
}

type PoseEventEnvelope = Omit<MmdRuntimeWorkerEventEnvelope, "event"> & {
  event: Extract<MmdRuntimeWorkerEvent, { type: "pose" }>;
};
