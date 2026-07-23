import { MmdRuntimeWorkerHost } from "./host.js";
import type {
  MmdRuntimeWorkerCommand,
  MmdRuntimeWorkerEvent,
  MmdRuntimeWorkerMessagePort
} from "./messages.js";
import { copyMmdRuntimePoseInto, type MmdRuntimePoseBuffer } from "./protocol.js";
import { MmdRuntimeTransferablePosePool } from "./transferablePool.js";
import {
  acquireMmdRuntimeSharedPoseWriteSlot,
  publishMmdRuntimeSharedPose,
  type MmdRuntimeSharedPoseSlot
} from "./sharedPose.js";
import {
  createWorkerExternalPhysicsBackend,
  type CustomBulletWorkerPhysicsConfig
} from "./externalPhysics.js";
import type { MmdPhysicsBackend } from "../physics/index.js";

const maxPreReadyCommands = 32;
type ReadyCommand = Exclude<MmdRuntimeWorkerCommand, { readonly type: "init" }>;

export interface MmdRuntimeWorkerEndpointOptions {
  readonly createExternalPhysicsBackend?: (
    config: CustomBulletWorkerPhysicsConfig
  ) => Promise<MmdPhysicsBackend>;
}

/** Owns one logical character runtime behind any Worker-like message port. */
export class MmdRuntimeWorkerEndpoint {
  private readonly port: MmdRuntimeWorkerMessagePort;
  private readonly createExternalPhysicsBackend: NonNullable<
    MmdRuntimeWorkerEndpointOptions["createExternalPhysicsBackend"]
  >;
  private readonly preReadyCommands: ReadyCommand[] = [];
  private readonly poseEvent: Extract<MmdRuntimeWorkerEvent, { readonly type: "pose" }> = {
    type: "pose",
    pose: undefined as unknown as MmdRuntimePoseBuffer
  };
  private readonly poseTransferList: Transferable[] = new Array<Transferable>(2);
  private sharedPoseSlots: readonly MmdRuntimeSharedPoseSlot[] | undefined;
  private sharedPoseEvents: readonly Extract<MmdRuntimeWorkerEvent, { readonly type: "sharedPose" }>[] = [];
  private host: MmdRuntimeWorkerHost | undefined;
  private pool: MmdRuntimeTransferablePosePool | undefined;
  private pendingTick: Extract<MmdRuntimeWorkerCommand, { readonly type: "tick" }> | undefined;
  private disposed = false;
  private initializing = false;
  private ownedPhysicsBackend: MmdPhysicsBackend | undefined;

  constructor(
    port: MmdRuntimeWorkerMessagePort,
    options: MmdRuntimeWorkerEndpointOptions = {}
  ) {
    this.port = port;
    this.createExternalPhysicsBackend =
      options.createExternalPhysicsBackend ?? createWorkerExternalPhysicsBackend;
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
    if (this.host || this.initializing) {
      throw new Error("MMD runtime worker endpoint is already initialized");
    }
    if (command.runtimeOptions?.physics === "external") {
      if (!command.externalPhysics) {
        throw new Error("External MMD physics worker configuration is required");
      }
      this.initializing = true;
      void this.initializeExternal(command);
      return;
    }
    if (command.externalPhysics) {
      throw new Error("External MMD physics worker configuration requires physics mode external");
    }
    this.finishInitialize(command);
  }

  private async initializeExternal(
    command: Extract<MmdRuntimeWorkerCommand, { readonly type: "init" }>
  ): Promise<void> {
    let backend: MmdPhysicsBackend | undefined;
    try {
      const config = command.externalPhysics;
      if (!config) {
        throw new Error("External MMD physics worker configuration is required");
      }
      backend = await this.createExternalPhysicsBackend(config);
      if (this.disposed) {
        backend.dispose?.();
        return;
      }
      this.ownedPhysicsBackend = backend;
      this.finishInitialize(command, backend);
    } catch (error) {
      backend?.dispose?.();
      if (this.ownedPhysicsBackend === backend) {
        this.ownedPhysicsBackend = undefined;
      }
      this.host?.dispose();
      this.host = undefined;
      this.pool = undefined;
      this.preReadyCommands.length = 0;
      if (!this.disposed) {
        this.port.postMessage({
          type: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    } finally {
      this.initializing = false;
    }
  }

  private finishInitialize(
    command: Extract<MmdRuntimeWorkerCommand, { readonly type: "init" }>,
    physicsBackend?: MmdPhysicsBackend
  ): void {
    this.host = new MmdRuntimeWorkerHost(command.descriptor, {
      runtimeOptions: physicsBackend
        ? { ...command.runtimeOptions, physicsBackend }
        : command.runtimeOptions
    });
    this.pool = new MmdRuntimeTransferablePosePool(
      command.descriptor.bones.length,
      command.descriptor.morphCount
    );
    if (command.sharedPoseSlots) {
      validateSharedPoseSlots(
        command.sharedPoseSlots,
        command.descriptor.bones.length,
        command.descriptor.morphCount
      );
      this.sharedPoseSlots = command.sharedPoseSlots;
      this.sharedPoseEvents = command.sharedPoseSlots.map((_, slot) => ({
        type: "sharedPose" as const,
        slot
      }));
    }
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
      case "sharedRelease":
        this.publishPendingTick();
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
    const sharedPoseSlots = this.sharedPoseSlots;
    if (host && sharedPoseSlots) {
      const target = acquireMmdRuntimeSharedPoseWriteSlot(sharedPoseSlots);
      if (!target) {
        return false;
      }
      const pose = host.evaluate(command.seconds, command.options);
      publishMmdRuntimeSharedPose(target, pose);
      const slot = sharedPoseSlots.indexOf(target);
      const event = this.sharedPoseEvents[slot];
      if (!event) {
        throw new Error(`MMD runtime shared pose slot index is invalid: ${slot}`);
      }
      this.port.postMessage(event);
      return true;
    }
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
    this.sharedPoseSlots = undefined;
    this.sharedPoseEvents = [];
    this.ownedPhysicsBackend?.dispose?.();
    this.ownedPhysicsBackend = undefined;
    this.port.postMessage({ type: "disposed" });
  }
}

function validateSharedPoseSlots(
  slots: readonly MmdRuntimeSharedPoseSlot[],
  boneCount: number,
  morphCount: number
): void {
  if (slots.length < 3) {
    throw new RangeError("MMD runtime worker shared pose transport requires at least 3 slots");
  }
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (
      !slot ||
      slot.control.length !== 3 ||
      slot.timing.length !== 3 ||
      slot.worldMatricesColumnMajor.length !== boneCount * 16 ||
      slot.morphWeights.length !== morphCount
    ) {
      throw new RangeError(`MMD runtime worker shared pose slot ${index} has an invalid layout`);
    }
  }
}
