import type { ThreeMmdRuntimeFactoryContext } from "../three/index.js";
import type { MmdRuntimeWorkerLike } from "./runtime.js";
import type {
  MmdRuntimeWorkerCommand,
  MmdRuntimeWorkerEvent,
  MmdRuntimeWorkerEventEnvelope,
  MmdRuntimeWorkerRuntimeId
} from "./messages.js";

export type MmdRuntimeWorkerPhysicalFactory = (
  context: ThreeMmdRuntimeFactoryContext
) => MmdRuntimeWorkerLike;

export interface MmdRuntimeWorkerPoolOptions {
  /** Maximum number of physical workers. Defaults to the bounded browser heuristic. */
  readonly size?: number;
  /** Factory used to create each physical worker slot. */
  readonly workerFactory?: MmdRuntimeWorkerPhysicalFactory;
  readonly workerUrl?: string | URL;
  readonly workerOptions?: WorkerOptions;
}

export interface MmdRuntimeWorkerLease {
  readonly runtimeId: MmdRuntimeWorkerRuntimeId;
  readonly generation: number;
  readonly worker: MmdRuntimeWorkerLike;
  /** Sends logical dispose once and releases the slot lease. */
  dispose(): void;
  /** Releases the slot lease without sending another command. */
  release(): void;
}

/**
 * Returns the default bounded pool size. Browser workers reserve one logical
 * core for rendering; non-browser runtimes use one slot as an explicit safe
 * fallback because `navigator` is unavailable there.
 */
export function getDefaultMmdRuntimeWorkerPoolSize(): number {
  if (typeof navigator === "undefined") {
    return 1;
  }
  return resolveMmdRuntimeWorkerPoolSize(navigator.hardwareConcurrency);
}

export function resolveMmdRuntimeWorkerPoolSize(hardwareConcurrency: number | undefined): number {
  if (hardwareConcurrency === undefined || !Number.isFinite(hardwareConcurrency)) {
    return 1;
  }
  return Math.max(0, Math.min(4, Math.floor(hardwareConcurrency) - 1));
}

interface MutableLease {
  readonly runtimeId: MmdRuntimeWorkerRuntimeId;
  readonly generation: number;
  readonly worker: LeaseWorker;
  dispose(): void;
  release(): void;
  crash(error: unknown): void;
}

interface MutableCommandEnvelope {
  runtimeId: MmdRuntimeWorkerRuntimeId;
  command: MmdRuntimeWorkerCommand;
}

interface Slot {
  readonly index: number;
  worker: MmdRuntimeWorkerLike | undefined;
  generation: number;
  dead: boolean;
  readonly leases: Set<MutableLease>;
  onMessage: ((event: unknown) => void) | undefined;
  onError: ((error: unknown) => void) | undefined;
  onExit: ((code: unknown) => void) | undefined;
}

/**
 * A bounded pool of physical workers. Logical runtimes are pinned to their
 * selected slot for their full lifetime; only logical dispose changes load.
 */
export class MmdRuntimeWorkerPool {
  private readonly options: MmdRuntimeWorkerPoolOptions;
  private readonly slots: Slot[];
  private nextRuntimeId = 1;
  private disposed = false;

  constructor(options: MmdRuntimeWorkerPoolOptions = {}) {
    this.options = options;
    const size = normalizePoolSize(options.size);
    this.slots = new Array<Slot>(size);
    for (let index = 0; index < size; index += 1) {
      this.slots[index] = {
        index,
        worker: undefined,
        generation: 0,
        dead: false,
        leases: new Set<MutableLease>(),
        onMessage: undefined,
        onError: undefined,
        onExit: undefined
      };
    }
  }

  size(): number {
    return this.slots.length;
  }

  activeLeaseCount(): number {
    let count = 0;
    for (const slot of this.slots) {
      count += slot.leases.size;
    }
    return count;
  }

  acquire(
    context: ThreeMmdRuntimeFactoryContext,
    workerFactory?: MmdRuntimeWorkerPhysicalFactory
  ): MmdRuntimeWorkerLease {
    if (this.disposed) {
      throw new Error("MMD runtime worker pool is disposed");
    }
    const slot = this.leastLoadedSlot();
    if (!slot) {
      throw new Error("MMD runtime worker pool has no available workers");
    }
    if (slot.dead || !slot.worker) {
      this.createSlotWorker(slot, context, workerFactory);
    }
    const worker = slot.worker;
    if (!worker) {
      throw new Error("MMD runtime worker pool failed to create a physical worker");
    }
    const runtimeId = this.nextRuntimeId;
    this.nextRuntimeId += 1;
    const lease = new Lease(this, slot, runtimeId, slot.generation, worker);
    slot.leases.add(lease);
    return lease;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const slot of this.slots) {
      slot.dead = true;
      const leases = Array.from(slot.leases);
      for (const lease of leases) {
        lease.crash(new Error("MMD runtime worker pool is disposed"));
      }
      slot.leases.clear();
      terminateWorker(slot.worker);
      slot.worker = undefined;
    }
  }

  release(slot: Slot, lease: MutableLease): void {
    if (!slot.leases.delete(lease)) {
      return;
    }
    if (slot.dead && slot.leases.size === 0) {
      terminateWorker(slot.worker);
      slot.worker = undefined;
    }
  }

  private leastLoadedSlot(): Slot | undefined {
    let selected: Slot | undefined;
    for (const slot of this.slots) {
      if (!selected || slot.leases.size < selected.leases.size) {
        selected = slot;
      }
    }
    return selected;
  }

  private createSlotWorker(
    slot: Slot,
    context: ThreeMmdRuntimeFactoryContext,
    workerFactory?: MmdRuntimeWorkerPhysicalFactory
  ): void {
    terminateWorker(slot.worker);
    const factory = workerFactory ?? this.options.workerFactory;
    const worker = factory
      ? factory(context)
      : createDefaultWorker(this.options.workerUrl, this.options.workerOptions);
    slot.worker = worker;
    slot.dead = false;
    slot.generation += 1;
    slot.onMessage = (event) => {
      const candidate =
        event && typeof event === "object" && "data" in event
          ? (event as { readonly data: unknown }).data
          : event;
      const envelope = candidate as MmdRuntimeWorkerEventEnvelope;
      if (envelope && typeof envelope.runtimeId === "number" && envelope.event) {
        for (const lease of slot.leases) {
          if (lease.runtimeId === envelope.runtimeId) {
            lease.worker.dispatch(envelope.event);
            return;
          }
        }
        return;
      }
      if (candidate && typeof candidate === "object" && "type" in candidate) {
        let onlyLease: MutableLease | undefined;
        let leaseCount = 0;
        for (const lease of slot.leases) {
          onlyLease = lease;
          leaseCount += 1;
        }
        if (leaseCount === 1) {
          onlyLease?.worker.dispatch(candidate as MmdRuntimeWorkerEvent);
        }
      }
    };
    slot.onError = (error) => {
      this.failSlot(slot, error);
    };
    slot.onExit = (code) => {
      this.failSlot(slot, new Error(`MMD runtime worker exited with code ${String(code)}`));
    };
    attachPhysicalWorker(worker, slot);
  }

  private failSlot(slot: Slot, error: unknown): void {
    if (slot.dead) {
      return;
    }
    slot.dead = true;
    const leases = Array.from(slot.leases);
    for (const lease of leases) {
      lease.crash(error);
    }
    slot.leases.clear();
    terminateWorker(slot.worker);
    slot.worker = undefined;
  }
}

class LeaseWorker implements MmdRuntimeWorkerLike {
  readonly runtimeId: MmdRuntimeWorkerRuntimeId;
  private readonly slot: Slot;
  private readonly pool: MmdRuntimeWorkerPool;
  private readonly physicalWorker: MmdRuntimeWorkerLike;
  private readonly commandEnvelope: MutableCommandEnvelope = {
    runtimeId: 0,
    command: undefined as unknown as MmdRuntimeWorkerCommand
  };
  private readonly messageEvent: { data: MmdRuntimeWorkerEvent } = {
    data: undefined as unknown as MmdRuntimeWorkerEvent
  };
  private readonly listeners = new Set<(event: { readonly data: MmdRuntimeWorkerEvent }) => void>();
  private readonly nodeListeners = new Set<(event: MmdRuntimeWorkerEvent) => void>();
  private released = false;
  private onmessageListener: ((event: { readonly data: MmdRuntimeWorkerEvent }) => void) | undefined;
  private onerrorListener: ((error: unknown) => void) | undefined;

  constructor(
    pool: MmdRuntimeWorkerPool,
    slot: Slot,
    runtimeId: MmdRuntimeWorkerRuntimeId,
    physicalWorker: MmdRuntimeWorkerLike
  ) {
    this.pool = pool;
    this.slot = slot;
    this.runtimeId = runtimeId;
    this.physicalWorker = physicalWorker;
    Object.defineProperties(this.commandEnvelope, {
      type: {
        enumerable: false,
        get: () => this.commandEnvelope.command?.type
      },
      descriptor: {
        enumerable: false,
        get: () => this.commandEnvelope.command?.type === "init"
          ? this.commandEnvelope.command.descriptor
          : undefined
      },
      runtimeOptions: {
        enumerable: false,
        get: () => this.commandEnvelope.command?.type === "init"
          ? this.commandEnvelope.command.runtimeOptions
          : undefined
      },
      sharedPoseSlots: {
        enumerable: false,
        get: () => this.commandEnvelope.command?.type === "init"
          ? this.commandEnvelope.command.sharedPoseSlots
          : undefined
      },
      externalPhysics: {
        enumerable: false,
        get: () => this.commandEnvelope.command?.type === "init"
          ? this.commandEnvelope.command.externalPhysics
          : undefined
      },
      epoch: {
        enumerable: false,
        get: () => this.commandEnvelope.command && "epoch" in this.commandEnvelope.command
          ? this.commandEnvelope.command.epoch
          : undefined
      },
      animation: {
        enumerable: false,
        get: () => this.commandEnvelope.command?.type === "setAnimation"
          ? this.commandEnvelope.command.animation
          : undefined
      },
      seconds: {
        enumerable: false,
        get: () => this.commandEnvelope.command && "seconds" in this.commandEnvelope.command
          ? this.commandEnvelope.command.seconds
          : undefined
      },
      options: {
        enumerable: false,
        get: () => this.commandEnvelope.command?.type === "tick"
          ? this.commandEnvelope.command.options
          : undefined
      },
      pose: {
        enumerable: false,
        get: () => this.commandEnvelope.command?.type === "recycle"
          ? this.commandEnvelope.command.pose
          : undefined
      }
    });
  }

  postMessage(message: MmdRuntimeWorkerCommand, transfer?: Transferable[]): void {
    if (this.released) {
      return;
    }
    const envelope = this.commandEnvelope;
    envelope.runtimeId = this.runtimeId;
    envelope.command = message;
    this.physicalWorker.postMessage(envelope as never, transfer);
  }

  terminate(): void {
    this.release();
  }

  addEventListener(type: string, listener: (event: { readonly data: MmdRuntimeWorkerEvent }) => void): void {
    if (type === "message") {
      this.listeners.add(listener);
    } else if (type === "error") {
      this.onerrorListener = listener as unknown as (error: unknown) => void;
    }
  }

  removeEventListener(type: string, listener: (event: { readonly data: MmdRuntimeWorkerEvent }) => void): void {
    if (type === "message") {
      this.listeners.delete(listener);
    } else if (type === "error" && this.onerrorListener === listener) {
      this.onerrorListener = undefined;
    }
  }

  on(type: string, listener: (event: MmdRuntimeWorkerEvent) => void): void {
    if (type === "message") {
      this.nodeListeners.add(listener);
    } else if (type === "error") {
      this.onerrorListener = listener as unknown as (error: unknown) => void;
    }
  }

  off(type: string, listener: (event: MmdRuntimeWorkerEvent) => void): void {
    if (type === "message") {
      this.nodeListeners.delete(listener);
    } else if (type === "error" && this.onerrorListener === listener) {
      this.onerrorListener = undefined;
    }
  }

  onmessage: unknown;
  onerror: unknown;

  dispatch(event: MmdRuntimeWorkerEvent): void {
    if (this.released) {
      return;
    }
    const message = this.messageEvent;
    message.data = event;
    for (const listener of this.listeners) {
      listener(message);
    }
    for (const listener of this.nodeListeners) {
      listener(event);
    }
    const onmessage = this.onmessageListener ?? (typeof this.onmessage === "function" ? this.onmessage : undefined);
    onmessage?.(message);
  }

  crash(error: unknown): void {
    if (this.released) {
      return;
    }
    this.dispatch({
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    });
    this.released = true;
  }

  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.pool.release(this.slot, this.owner);
  }

  owner!: MutableLease;

  setOwner(owner: MutableLease): void {
    this.owner = owner;
  }
}

class Lease implements MutableLease, MmdRuntimeWorkerLease {
  readonly runtimeId: MmdRuntimeWorkerRuntimeId;
  readonly generation: number;
  readonly worker: LeaseWorker;
  private disposed = false;

  constructor(
    private readonly pool: MmdRuntimeWorkerPool,
    private readonly slot: Slot,
    runtimeId: MmdRuntimeWorkerRuntimeId,
    generation: number,
    physicalWorker: MmdRuntimeWorkerLike
  ) {
    this.runtimeId = runtimeId;
    this.generation = generation;
    this.worker = new LeaseWorker(pool, slot, runtimeId, physicalWorker);
    this.worker.setOwner(this);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    if (!this.workerReleased() && !this.slot.dead) {
      this.worker.postMessage({ type: "dispose" });
    }
    this.release();
  }

  release(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.worker.release();
  }

  crash(error: unknown): void {
    this.worker.crash(error);
    this.disposed = true;
  }

  private workerReleased(): boolean {
    return this.disposed;
  }
}

function normalizePoolSize(size: number | undefined): number {
  if (size === undefined) {
    return getDefaultMmdRuntimeWorkerPoolSize();
  }
  if (!Number.isFinite(size)) {
    throw new RangeError("MMD runtime worker pool size must be finite");
  }
  return Math.max(0, Math.floor(size));
}

function createDefaultWorker(
  workerUrl: string | URL | undefined,
  workerOptions: WorkerOptions | undefined
): MmdRuntimeWorkerLike {
  const WorkerConstructor = (globalThis as typeof globalThis & {
    Worker?: new (url: string | URL, options?: WorkerOptions) => MmdRuntimeWorkerLike;
  }).Worker;
  if (!WorkerConstructor) {
    throw new Error("MMD runtime worker is unavailable in this environment");
  }
  return new WorkerConstructor(workerUrl ?? new URL("./entry.js", import.meta.url), {
    type: "module",
    ...workerOptions
  });
}

function attachPhysicalWorker(worker: MmdRuntimeWorkerLike, slot: Slot): void {
  if (worker.addEventListener) {
    worker.addEventListener("message", slot.onMessage as never);
    worker.addEventListener("error", slot.onError as never);
    return;
  }
  if (worker.on) {
    worker.on("message", slot.onMessage as never);
    worker.on("error", slot.onError as never);
    worker.on("exit", slot.onExit as never);
    return;
  }
  worker.onmessage = slot.onMessage;
  worker.onerror = slot.onError;
}

function terminateWorker(worker: MmdRuntimeWorkerLike | undefined): void {
  if (worker) {
    void worker.terminate?.();
  }
}
