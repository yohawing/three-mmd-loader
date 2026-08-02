import { describe, expect, it } from "vitest";

import {
  acquireMmdRuntimeSharedPoseWriteSlot,
  createMmdRuntimePoseBuffer,
  createMmdRuntimeSharedPoseReadBuffer,
  createMmdRuntimeSharedPoseSlots,
  publishMmdRuntimeSharedPose,
  readMmdRuntimeSharedPoseInto,
  releaseMmdRuntimeSharedPoseReadSlot
} from "../../../src/worker/index.js";

describe("MMD runtime shared pose slots", () => {
  it("publishes through a structured-cloned SAB triple buffer", () => {
    const producerSlots = createMmdRuntimeSharedPoseSlots(1, 2);
    const consumerSlots = structuredClone(producerSlots);
    const source = createMmdRuntimePoseBuffer(1, 2);
    Object.assign(source, { epoch: 4, sequence: 9, seconds: 1.25, frame: 37.5 });
    source.worldMatricesColumnMajor[12] = 3;
    source.morphWeights.set([0.25, 0.75]);

    const producerSlot = acquireMmdRuntimeSharedPoseWriteSlot(producerSlots);
    if (!producerSlot) {
      throw new Error("Expected a writable shared pose slot");
    }
    publishMmdRuntimeSharedPose(producerSlot, source);

    const target = createMmdRuntimeSharedPoseReadBuffer(1, 2);
    const consumerSlot = consumerSlots[0];
    if (!consumerSlot) {
      throw new Error("Expected a readable shared pose slot");
    }
    expect(readMmdRuntimeSharedPoseInto(consumerSlot, target)).toBe(target);
    expect(target).toMatchObject({ epoch: 4, sequence: 9, seconds: 1.25, frame: 37.5 });
    expect(target.worldMatricesColumnMajor[12]).toBe(3);
    expect(Array.from(target.morphWeights)).toEqual([0.25, 0.75]);
    releaseMmdRuntimeSharedPoseReadSlot(consumerSlot);
    expect(acquireMmdRuntimeSharedPoseWriteSlot(producerSlots)).toBe(producerSlots[0]);
  });

  it("never reuses writing, ready, or reading slots", () => {
    const slots = createMmdRuntimeSharedPoseSlots(0, 0);
    const source = createMmdRuntimePoseBuffer(0, 0);
    const target = createMmdRuntimeSharedPoseReadBuffer(0, 0);
    for (let index = 0; index < slots.length; index += 1) {
      const slot = acquireMmdRuntimeSharedPoseWriteSlot(slots);
      expect(slot).toBe(slots[index]);
      if (!slot) {
        throw new Error("Expected a writable shared pose slot");
      }
      publishMmdRuntimeSharedPose(slot, source);
    }
    expect(acquireMmdRuntimeSharedPoseWriteSlot(slots)).toBeUndefined();
    const middleSlot = slots[1];
    if (!middleSlot) {
      throw new Error("Expected the middle shared pose slot");
    }
    expect(readMmdRuntimeSharedPoseInto(middleSlot, target)).toBe(target);
    expect(acquireMmdRuntimeSharedPoseWriteSlot(slots)).toBeUndefined();
    releaseMmdRuntimeSharedPoseReadSlot(middleSlot);
    expect(acquireMmdRuntimeSharedPoseWriteSlot(slots)).toBe(slots[1]);
  });

  it("rejects capacities below three", () => {
    expect(() => createMmdRuntimeSharedPoseSlots(1, 0, 2)).toThrow(
      "MMD runtime shared pose capacity must be at least 3"
    );
  });
});
