import { MmdRuntimeWorkerHost } from "./host.js";
import type {
  MmdRuntimeWorkerCommand,
  MmdRuntimeWorkerEvent,
  MmdRuntimeWorkerMessagePort
} from "./messages.js";
import { copyMmdRuntimePoseInto, type MmdRuntimePoseBuffer } from "./protocol.js";
import { MmdRuntimeTransferablePosePool } from "./transferablePool.js";

const maxPreReadyCommands = 32;
type ReadyCommand = Exclude<MmdRuntimeWorkerCommand, { readonly type: "init" }>;

/** Owns one logical character runtime behind any Worker-like message port. */
export class MmdRuntimeWorkerEndpoint {
  private readonly port: MmdRuntimeWorkerMessagePort;
  private readonly preReadyCommands: ReadyCommand[] = [];
  private readonly poseEvent: Extract<MmdRuntimeWorkerEvent, { readonly type: "pose" }> = {
    type: "pose",
    pose: undefined as unknown as MmdRuntimePoseBuffer
  };
  private readonly poseTransferList: Transferable[] = new Array<Transferable>(2);
  private host: MmdRuntimeWorkerHost | undefined;
  private pool: MmdRuntimeTransferablePosePool | undefined;
  private pendingTick: Extract<MmdRuntimeWorkerCommand, { readonly type: "tick" }> | undefined;
  private disposed = false;

  constructor(port: MmdRuntimeWorkerMessagePort) {
    this.port = port;
  }

  handle(command: MmdRuntimeWorkerCommand): void {
    if (this.disposed) {
      return;
    }
    try {
      if (command.type === "init") {
        this.initialize(command);
        return;
      }
      if (!this.host || !this.pool) {
        this.queueBeforeReady(command);
        return;
      }
      this.handleReadyCommand(command);
    } catch (error) {
      this.port.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private initialize(command: Extract<MmdRuntimeWorkerCommand, { readonly type: "init" }>): void {
    if (this.host) {
      throw new Error("MMD runtime worker endpoint is already initialized");
    }
    if (command.runtimeOptions?.physics === "external") {
      throw new Error("External MMD physics is not supported by the transferable worker endpoint");
    }
    this.host = new MmdRuntimeWorkerHost(command.descriptor, {
      runtimeOptions: command.runtimeOptions
    });
    this.pool = new MmdRuntimeTransferablePosePool(
      command.descriptor.bones.length,
      command.descriptor.morphCount
    );
    this.port.postMessage({ type: "ready", epoch: this.host.epoch() });
    for (let index = 0; index < this.preReadyCommands.length; index += 1) {
      const queued = this.preReadyCommands[index];
      if (queued) {
        this.handleReadyCommand(queued);
      }
    }
    this.preReadyCommands.length = 0;
  }

  private queueBeforeReady(command: ReadyCommand): void {
    if (command.type === "dispose") {
      this.dispose();
      return;
    }
    if (this.preReadyCommands.length >= maxPreReadyCommands) {
      throw new Error("MMD runtime worker ready queue overflow");
    }
    this.preReadyCommands.push(command);
  }

  private handleReadyCommand(command: ReadyCommand): void {
    const host = this.host;
    const pool = this.pool;
    if (!host || !pool) {
      return;
    }
    switch (command.type) {
      case "setAnimation":
        host.setAnimation(command.animation);
        this.assertEpoch(command.epoch);
        break;
      case "seek":
        host.seek(command.seconds);
        this.assertEpoch(command.epoch);
        break;
      case "resetPose":
        host.resetPose();
        this.assertEpoch(command.epoch);
        break;
      case "clearAnimation":
        host.clearAnimation();
        this.assertEpoch(command.epoch);
        break;
      case "tick":
        if (command.epoch !== host.epoch()) {
          break;
        }
        if (!this.publishTick(command)) {
          this.pendingTick = command;
        }
        break;
      case "recycle":
        if (pool.release(command.pose)) {
          this.publishPendingTick();
        }
        break;
      case "dispose":
        this.dispose();
        break;
    }
  }

  private publishTick(
    command: Extract<MmdRuntimeWorkerCommand, { readonly type: "tick" }>
  ): boolean {
    const host = this.host;
    const pool = this.pool;
    const target = pool?.acquire();
    if (!host || !target) {
      return false;
    }
    const pose = copyMmdRuntimePoseInto(
      host.evaluate(command.seconds, command.options),
      target
    );
    (this.poseEvent as { pose: MmdRuntimePoseBuffer }).pose = pose;
    this.poseTransferList[0] = pose.worldMatricesColumnMajor.buffer;
    this.poseTransferList[1] = pose.morphWeights.buffer;
    this.port.postMessage(this.poseEvent, this.poseTransferList);
    return true;
  }

  private publishPendingTick(): void {
    const pending = this.pendingTick;
    if (!pending) {
      return;
    }
    this.pendingTick = undefined;
    if (!this.publishTick(pending)) {
      this.pendingTick = pending;
    }
  }

  private assertEpoch(expected: number): void {
    if (this.host?.epoch() !== expected) {
      throw new Error(
        `MMD runtime worker epoch mismatch: expected ${expected}, actual ${this.host?.epoch()}`
      );
    }
  }

  private dispose(): void {
    this.disposed = true;
    this.pendingTick = undefined;
    this.preReadyCommands.length = 0;
    this.host?.dispose();
    this.host = undefined;
    this.pool = undefined;
    this.port.postMessage({ type: "disposed" });
  }
}
