import type * as THREE from "three";
import type { MmdFrameState } from "../runtime/types.js";

const mmdAxisSigns = [1, 1, -1, 1] as const;

export const MMD_RUNTIME_POSE_PROTOCOL_VERSION = 1 as const;

export interface MmdRuntimePoseBuffer {
  readonly version: typeof MMD_RUNTIME_POSE_PROTOCOL_VERSION;
  readonly epoch: number;
  readonly sequence: number;
  readonly seconds: number;
  readonly frame: number;
  readonly frameRate: number;
  readonly worldMatricesColumnMajor: Float32Array;
  readonly morphWeights: Float32Array;
}

interface MutableMmdRuntimePoseBuffer extends MmdRuntimePoseBuffer {
  epoch: number;
  sequence: number;
  seconds: number;
  frame: number;
  frameRate: number;
}

export function createMmdRuntimePoseBuffer(
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

/** Writes one pose into a caller-owned buffer without allocating. */
export function captureMmdRuntimePoseInto(
  mesh: THREE.SkinnedMesh,
  frameState: MmdFrameState,
  epoch: number,
  sequence: number,
  target: MmdRuntimePoseBuffer
): MmdRuntimePoseBuffer {
  const bones = mesh.skeleton.bones;
  if (target.worldMatricesColumnMajor.length !== bones.length * 16) {
    throw new RangeError("MMD runtime pose bone buffer length mismatch");
  }
  const influences = mesh.morphTargetInfluences;
  if (target.morphWeights.length !== (influences?.length ?? 0)) {
    throw new RangeError("MMD runtime pose morph buffer length mismatch");
  }

  mesh.updateWorldMatrix(false, true);
  for (let boneIndex = 0; boneIndex < bones.length; boneIndex += 1) {
    const elements = bones[boneIndex]?.matrixWorld.elements;
    if (!elements) {
      continue;
    }
    const offset = boneIndex * 16;
    for (let column = 0; column < 4; column += 1) {
      const columnSign = mmdAxisSigns[column];
      for (let row = 0; row < 4; row += 1) {
        target.worldMatricesColumnMajor[offset + column * 4 + row] =
          mmdAxisSigns[row] * elements[column * 4 + row] * columnSign;
      }
    }
  }
  for (let index = 0; index < target.morphWeights.length; index += 1) {
    target.morphWeights[index] = influences?.[index] ?? 0;
  }

  const mutableTarget = target as MutableMmdRuntimePoseBuffer;
  mutableTarget.epoch = epoch;
  mutableTarget.sequence = sequence;
  mutableTarget.seconds = frameState.seconds;
  mutableTarget.frame = frameState.frame;
  mutableTarget.frameRate = frameState.frameRate;
  return target;
}

export function isCurrentMmdRuntimePose(
  pose: MmdRuntimePoseBuffer,
  epoch: number,
  lastAppliedSequence = -1
): boolean {
  return pose.epoch === epoch && pose.sequence > lastAppliedSequence;
}

function assertCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`MMD runtime pose ${label} count must be a non-negative integer`);
  }
}
