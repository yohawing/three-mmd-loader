import {
  MMD_RUNTIME_POSE_PROTOCOL_VERSION,
  type MmdRuntimePoseBuffer
} from "./protocol.js";

const sharedPoseFree = 0;
const sharedPoseWriting = 1;
const sharedPoseReady = 2;
const sharedPoseReading = 3;

export interface MmdRuntimeSharedPoseSlot {
  readonly control: Int32Array<SharedArrayBuffer>;
  readonly timing: Float64Array<SharedArrayBuffer>;
  readonly worldMatricesColumnMajor: Float32Array<SharedArrayBuffer>;
  readonly morphWeights: Float32Array<SharedArrayBuffer>;
}

interface MutableMmdRuntimePoseBuffer extends MmdRuntimePoseBuffer {
  epoch: number;
  sequence: number;
  seconds: number;
  frame: number;
  frameRate: number;
}

export function createMmdRuntimeSharedPoseSlots(
  boneCount: number,
  morphCount: number,
  capacity = 3
): MmdRuntimeSharedPoseSlot[] {
  assertCount(boneCount, "bone");
  assertCount(morphCount, "morph");
  if (!Number.isInteger(capacity) || capacity < 3) {
    throw new RangeError("MMD runtime shared pose capacity must be at least 3");
  }
  const slots = new Array<MmdRuntimeSharedPoseSlot>(capacity);
  for (let index = 0; index < capacity; index += 1) {
    slots[index] = {
      control: new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3)),
      timing: new Float64Array(new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT * 3)),
      worldMatricesColumnMajor: new Float32Array(
        new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * boneCount * 16)
      ),
      morphWeights: new Float32Array(
        new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * morphCount)
      )
    };
  }
  return slots;
}

/** Claims one free slot for a worker-side write without blocking. */
export function acquireMmdRuntimeSharedPoseWriteSlot(
  slots: readonly MmdRuntimeSharedPoseSlot[]
): MmdRuntimeSharedPoseSlot | undefined {
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (
      slot &&
      Atomics.compareExchange(slot.control, 0, sharedPoseFree, sharedPoseWriting) === sharedPoseFree
    ) {
      return slot;
    }
  }
  return undefined;
}

/** Publishes a fully-written slot with release ordering. */
export function publishMmdRuntimeSharedPose(
  slot: MmdRuntimeSharedPoseSlot,
  source: MmdRuntimePoseBuffer
): void {
  assertPayloadLengths(slot, source);
  if (Atomics.load(slot.control, 0) !== sharedPoseWriting) {
    throw new Error("MMD runtime shared pose slot is not owned for writing");
  }
  slot.worldMatricesColumnMajor.set(source.worldMatricesColumnMajor);
  slot.morphWeights.set(source.morphWeights);
  slot.timing[0] = source.seconds;
  slot.timing[1] = source.frame;
  slot.timing[2] = source.frameRate;
  Atomics.store(slot.control, 1, source.epoch);
  Atomics.store(slot.control, 2, source.sequence);
  Atomics.store(slot.control, 0, sharedPoseReady);
  Atomics.notify(slot.control, 0);
}

/** Claims a published slot and exposes it through a caller-owned pose object. */
export function readMmdRuntimeSharedPoseInto(
  slot: MmdRuntimeSharedPoseSlot,
  target: MmdRuntimePoseBuffer
): MmdRuntimePoseBuffer | undefined {
  if (
    Atomics.compareExchange(slot.control, 0, sharedPoseReady, sharedPoseReading) !== sharedPoseReady
  ) {
    return undefined;
  }
  assertPayloadLengths(slot, target);
  const mutableTarget = target as MutableMmdRuntimePoseBuffer;
  mutableTarget.epoch = Atomics.load(slot.control, 1);
  mutableTarget.sequence = Atomics.load(slot.control, 2);
  mutableTarget.seconds = slot.timing[0] ?? 0;
  mutableTarget.frame = slot.timing[1] ?? 0;
  mutableTarget.frameRate = slot.timing[2] ?? 30;
  target.worldMatricesColumnMajor.set(slot.worldMatricesColumnMajor);
  target.morphWeights.set(slot.morphWeights);
  return target;
}

export function releaseMmdRuntimeSharedPoseReadSlot(slot: MmdRuntimeSharedPoseSlot): void {
  if (
    Atomics.compareExchange(slot.control, 0, sharedPoseReading, sharedPoseFree) !== sharedPoseReading
  ) {
    throw new Error("MMD runtime shared pose slot is not owned for reading");
  }
  Atomics.notify(slot.control, 0);
}

export function resetMmdRuntimeSharedPoseSlot(slot: MmdRuntimeSharedPoseSlot): void {
  Atomics.store(slot.control, 0, sharedPoseFree);
  Atomics.store(slot.control, 1, 0);
  Atomics.store(slot.control, 2, 0);
}

export function createMmdRuntimeSharedPoseReadBuffer(
  boneCount: number,
  morphCount: number
): MmdRuntimePoseBuffer {
  assertCount(boneCount, "bone");
  assertCount(morphCount, "morph");
  return {
    version: MMD_RUNTIME_POSE_PROTOCOL_VERSION,
    epoch: 0,
    sequence: 0,
    seconds: 0,
    frame: 0,
    frameRate: 30,
    worldMatricesColumnMajor: new Float32Array(boneCount * 16),
    morphWeights: new Float32Array(morphCount)
  };
}

function assertPayloadLengths(
  slot: MmdRuntimeSharedPoseSlot,
  pose: MmdRuntimePoseBuffer
): void {
  if (
    slot.worldMatricesColumnMajor.length !== pose.worldMatricesColumnMajor.length ||
    slot.morphWeights.length !== pose.morphWeights.length
  ) {
    throw new RangeError("MMD runtime shared pose payload length mismatch");
  }
}

function assertCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`MMD runtime shared pose ${label} count must be a non-negative integer`);
  }
}
