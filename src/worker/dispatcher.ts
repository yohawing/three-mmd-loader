import { MmdRuntimeWorkerEndpoint } from "./endpoint.js";
import type {
  MmdRuntimeWorkerCommandEnvelope,
  MmdRuntimeWorkerEvent,
  MmdRuntimeWorkerMessagePort,
  MmdRuntimeWorkerMultiplexedMessagePort,
  MmdRuntimeWorkerRuntimeId
} from "./messages.js";

/**
 * Routes commands for multiple logical character runtimes through one worker
 * port. Each runtime keeps its own endpoint and event envelope, so a pose
 * transfer does not allocate a wrapper object or transfer list on the hot path.
 */
export class MmdRuntimeWorkerDispatcher {
  private readonly port: MmdRuntimeWorkerMultiplexedMessagePort;
  private readonly endpoints = new Map<MmdRuntimeWorkerRuntimeId, MmdRuntimeWorkerEndpoint>();
  private readonly runtimePorts = new Map<
    MmdRuntimeWorkerRuntimeId,
    MmdRuntimeWorkerDispatcherRuntimePort
  >();

  constructor(port: MmdRuntimeWorkerMultiplexedMessagePort) {
    this.port = port;
  }

  /** Handles one runtime command envelope. */
  handle(message: MmdRuntimeWorkerCommandEnvelope): void {
    const runtimeId = message.runtimeId;
    const command = message.command;
    const endpoint = this.endpoints.get(runtimeId);

    if (command.type === "init") {
      if (endpoint) {
        this.reportError(
          runtimeId,
          `MMD runtime worker runtime ${runtimeId} is already initialized`
        );
        return;
      }
      const runtimePort = new MmdRuntimeWorkerDispatcherRuntimePort(this.port, runtimeId);
      const runtimeEndpoint = new MmdRuntimeWorkerEndpoint(runtimePort);
      this.runtimePorts.set(runtimeId, runtimePort);
      this.endpoints.set(runtimeId, runtimeEndpoint);
      runtimeEndpoint.handle(command);
      if (runtimePort.initializationFailed()) {
        this.endpoints.delete(runtimeId);
        this.runtimePorts.delete(runtimeId);
      }
      return;
    }

    if (!endpoint) {
      this.reportError(
        runtimeId,
        `MMD runtime worker runtime ${runtimeId} is unknown; init is required`
      );
      return;
    }

    endpoint.handle(command);
    if (command.type === "dispose") {
      this.endpoints.delete(runtimeId);
      this.runtimePorts.delete(runtimeId);
    }
  }

  /** Number of active logical runtimes currently owned by this dispatcher. */
  runtimeCount(): number {
    return this.endpoints.size;
  }

  private reportError(runtimeId: MmdRuntimeWorkerRuntimeId, message: string): void {
    const runtimePort = this.runtimePorts.get(runtimeId);
    if (runtimePort) {
      runtimePort.postMessage({ type: "error", message });
      return;
    }
    this.port.postMessage({
      runtimeId,
      event: { type: "error", message }
    });
  }
}

/**
 * Adapts one endpoint's ordinary event port to the dispatcher's multiplexed
 * port. The outer envelope is deliberately mutable and retained per runtime.
 */
class MmdRuntimeWorkerDispatcherRuntimePort implements MmdRuntimeWorkerMessagePort {
  private readonly port: MmdRuntimeWorkerMultiplexedMessagePort;
  private readonly envelope: {
    runtimeId: MmdRuntimeWorkerRuntimeId;
    event: MmdRuntimeWorkerEvent;
  };
  private initialized = false;
  private failed = false;

  constructor(
    port: MmdRuntimeWorkerMultiplexedMessagePort,
    runtimeId: MmdRuntimeWorkerRuntimeId
  ) {
    this.port = port;
    this.envelope = {
      runtimeId,
      event: undefined as unknown as MmdRuntimeWorkerEvent
    };
  }

  postMessage(message: MmdRuntimeWorkerEvent, transfer?: Transferable[]): void {
    if (message.type === "ready") {
      this.initialized = true;
    } else if (message.type === "error" && !this.initialized) {
      this.failed = true;
    }
    this.envelope.event = message;
    this.port.postMessage(this.envelope, transfer);
  }

  initializationFailed(): boolean {
    return this.failed;
  }
}

/** Alias retained for callers that use the shorter dispatcher name. */
export type MmdRuntimeWorkerDispatcherMessagePort = MmdRuntimeWorkerMultiplexedMessagePort;

/** Alias for the command envelope accepted by the dispatcher. */
export type MmdRuntimeWorkerDispatcherCommand = MmdRuntimeWorkerCommandEnvelope;
