import type { MmdAnimation } from "../parser/model/modelTypes.js";
import type { DefaultMmdRuntimeOptions, MmdRuntimeEvaluateOptions } from "../runtime/types.js";
import type { MmdRuntimeModelDescriptor } from "./modelDescriptor.js";
import type { MmdRuntimePoseBuffer } from "./protocol.js";
import type { MmdRuntimeSharedPoseSlot } from "./sharedPose.js";
import type { CustomBulletWorkerPhysicsConfig } from "./externalPhysics.js";

export type MmdRuntimeWorkerCommand =
  | {
      readonly type: "init";
      readonly descriptor: MmdRuntimeModelDescriptor;
      readonly runtimeOptions?: Omit<DefaultMmdRuntimeOptions, "physicsBackend">;
      readonly sharedPoseSlots?: readonly MmdRuntimeSharedPoseSlot[];
      readonly externalPhysics?: CustomBulletWorkerPhysicsConfig;
    }
  | { readonly type: "setAnimation"; readonly epoch: number; readonly animation: MmdAnimation }
  | {
      readonly type: "tick";
      readonly epoch: number;
      readonly seconds: number;
      readonly options?: MmdRuntimeEvaluateOptions;
    }
  | { readonly type: "seek"; readonly epoch: number; readonly seconds: number }
  | { readonly type: "resetPose"; readonly epoch: number }
  | { readonly type: "clearAnimation"; readonly epoch: number }
  | { readonly type: "recycle"; readonly pose: MmdRuntimePoseBuffer }
  | { readonly type: "sharedRelease" }
  | { readonly type: "dispose" };

export type MmdRuntimeWorkerEvent =
  | { readonly type: "ready"; readonly epoch: number }
  | { readonly type: "pose"; readonly pose: MmdRuntimePoseBuffer }
  | { readonly type: "sharedPose"; readonly slot: number }
  | { readonly type: "disposed" }
  | { readonly type: "error"; readonly message: string };

export interface MmdRuntimeWorkerMessagePort {
  postMessage(message: MmdRuntimeWorkerEvent, transfer?: Transferable[]): void;
}

/** Identifies one logical character runtime on a multiplexed worker port. */
export type MmdRuntimeWorkerRuntimeId = number;

/** Command envelope used by the worker-side runtime dispatcher. */
export interface MmdRuntimeWorkerCommandEnvelope {
  readonly runtimeId: MmdRuntimeWorkerRuntimeId;
  readonly command: MmdRuntimeWorkerCommand;
}

/** Event envelope emitted by the worker-side runtime dispatcher. */
export interface MmdRuntimeWorkerEventEnvelope {
  readonly runtimeId: MmdRuntimeWorkerRuntimeId;
  readonly event: MmdRuntimeWorkerEvent;
}

/** Message port for a multiplexed worker endpoint. */
export interface MmdRuntimeWorkerMultiplexedMessagePort {
  postMessage(message: MmdRuntimeWorkerEventEnvelope, transfer?: Transferable[]): void;
}

/** Naming aliases for callers that refer to envelopes as multiplexed messages. */
export type MmdRuntimeWorkerMultiplexedCommand = MmdRuntimeWorkerCommandEnvelope;
export type MmdRuntimeWorkerMultiplexedEvent = MmdRuntimeWorkerEventEnvelope;
