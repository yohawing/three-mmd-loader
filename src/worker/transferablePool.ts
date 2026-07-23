import {
  createMmdRuntimePoseBuffer,
  type MmdRuntimePoseBuffer
} from "./protocol.js";

export class MmdRuntimeTransferablePosePool {
  private readonly capacity: number;
  private readonly boneValueCount: number;
  private readonly morphCount: number;
  private readonly available: MmdRuntimePoseBuffer[];

  constructor(boneCount: number, morphCount: number, capacity = 3) {
    if (!Number.isInteger(capacity) || capacity < 2) {
      throw new RangeError("MMD runtime transferable pose pool capacity must be at least 2");
    }
    this.capacity = capacity;
    this.boneValueCount = boneCount * 16;
    this.morphCount = morphCount;
    this.available = new Array<MmdRuntimePoseBuffer>(capacity);
    for (let index = 0; index < capacity; index += 1) {
      this.available[index] = createMmdRuntimePoseBuffer(boneCount, morphCount);
    }
  }

  acquire(): MmdRuntimePoseBuffer | undefined {
    return this.available.pop();
  }

  release(pose: MmdRuntimePoseBuffer): boolean {
    if (
      this.available.length >= this.capacity ||
      pose.worldMatricesColumnMajor.length !== this.boneValueCount ||
      pose.morphWeights.length !== this.morphCount
    ) {
      return false;
    }
    for (let index = 0; index < this.available.length; index += 1) {
      const availablePose = this.available[index];
      if (
        availablePose?.worldMatricesColumnMajor.buffer === pose.worldMatricesColumnMajor.buffer &&
        availablePose.morphWeights.buffer === pose.morphWeights.buffer
      ) {
        return false;
      }
    }
    this.available.push(pose);
    return true;
  }

  availableCount(): number {
    return this.available.length;
  }
}
