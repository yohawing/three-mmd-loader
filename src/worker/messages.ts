import type { MmdAnimation } from "../parser/model/modelTypes.js";
import type { DefaultMmdRuntimeOptions, MmdRuntimeEvaluateOptions } from "../runtime/types.js";
import type { MmdRuntimeModelDescriptor } from "./modelDescriptor.js";
import type { MmdRuntimePoseBuffer } from "./protocol.js";

export type MmdRuntimeWorkerCommand =
  | {
      readonly type: "init";
      readonly descriptor: MmdRuntimeModelDescriptor;
      readonly runtimeOptions?: Omit<DefaultMmdRuntimeOptions, "physicsBackend">;
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
  | { readonly type: "dispose" };

export type MmdRuntimeWorkerEvent =
  | { readonly type: "ready"; readonly epoch: number }
  | { readonly type: "pose"; readonly pose: MmdRuntimePoseBuffer }
  | { readonly type: "disposed" }
  | { readonly type: "error"; readonly message: string };

export interface MmdRuntimeWorkerMessagePort {
  postMessage(message: MmdRuntimeWorkerEvent, transfer?: Transferable[]): void;
}
