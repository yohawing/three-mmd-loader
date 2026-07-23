import { describe, expect, it } from "vitest";

import {
  MmdRuntimeWorkerPool,
  resolveMmdRuntimeWorkerPoolSize,
  type MmdRuntimeWorkerLike
} from "../../../src/worker/index.js";
import type {
  MmdRuntimeWorkerCommand,
  MmdRuntimeWorkerCommandEnvelope,
  MmdRuntimeWorkerEvent,
  MmdRuntimeWorkerEventEnvelope
} from "../../../src/worker/messages.js";

describe("MMD runtime worker pool", () => {
  it("resolves the bounded pool size heuristic", () => {
    expect(resolveMmdRuntimeWorkerPoolSize(8)).toBe(4);
    expect(resolveMmdRuntimeWorkerPoolSize(4)).toBe(3);
    expect(resolveMmdRuntimeWorkerPoolSize(2)).toBe(1);
    expect(resolveMmdRuntimeWorkerPoolSize(1)).toBe(0);
    expect(resolveMmdRuntimeWorkerPoolSize(undefined)).toBe(1);
  });

  it("pins logical runtimes to least-loaded physical slots", () => {
    const workers: FakePhysicalWorker[] = [];
    const pool = createPool(2, workers);
    const context = {} as never;
    const leases = [
      pool.acquire(context),
      pool.acquire(context),
      pool.acquire(context),
      pool.acquire(context)
    ];

    for (const lease of leases) {
      lease.worker.postMessage({ type: "tick", epoch: 0, seconds: 0 });
    }

    expect(workers).toHaveLength(2);
    expect(workers[0]?.runtimeIds).toEqual([1, 3]);
    expect(workers[1]?.runtimeIds).toEqual([2, 4]);
    expect(leases.map((lease) => lease.runtimeId)).toEqual([1, 2, 3, 4]);
    expect(pool.activeLeaseCount()).toBe(4);

    for (const lease of leases) {
      lease.release();
    }
  });

  it("never reuses logical runtime ids after a release", () => {
    const workers: FakePhysicalWorker[] = [];
    const pool = createPool(1, workers);
    const context = {} as never;

    const first = pool.acquire(context);
    first.release();
    const second = pool.acquire(context);
    second.release();

    expect(second.runtimeId).toBe(first.runtimeId + 1);
    expect(second.generation).toBe(first.generation);
    expect(workers).toHaveLength(1);
  });

  it("decrements logical load on dispose while keeping the physical worker alive", () => {
    const workers: FakePhysicalWorker[] = [];
    const pool = createPool(1, workers);
    const context = {} as never;
    const first = pool.acquire(context);
    const second = pool.acquire(context);
    const physical = workers[0];

    first.dispose();
    first.dispose();
    expect(pool.activeLeaseCount()).toBe(1);
    expect(physical?.commandTypes.filter((type) => type === "dispose")).toHaveLength(1);
    expect(physical?.terminateCount).toBe(0);

    second.release();
    expect(pool.activeLeaseCount()).toBe(0);
    expect(physical?.terminateCount).toBe(0);

    const replacement = pool.acquire(context);
    expect(replacement.worker).not.toBe(first.worker);
    expect(workers).toHaveLength(1);
    replacement.release();
  });

  it("reports a slot crash only to that slot's leases and regenerates its generation", () => {
    const workers: FakePhysicalWorker[] = [];
    const pool = createPool(2, workers);
    const context = {} as never;
    const slot0LeaseA = pool.acquire(context);
    const slot1Lease = pool.acquire(context);
    const slot0LeaseB = pool.acquire(context);
    const slot0LeaseAEvents: MmdRuntimeWorkerEvent[] = [];
    const slot0LeaseBEvents: MmdRuntimeWorkerEvent[] = [];
    const slot1Events: MmdRuntimeWorkerEvent[] = [];
    const slot0Errors: unknown[] = [];

    slot0LeaseA.worker.on("message", (event) => slot0LeaseAEvents.push(event));
    slot0LeaseA.worker.on("error", ((error: unknown) => slot0Errors.push(error)) as never);
    slot0LeaseB.worker.on("message", (event) => slot0LeaseBEvents.push(event));
    slot1Lease.worker.on("message", (event) => slot1Events.push(event));

    const oldGeneration = slot0LeaseA.generation;
    workers[0]?.crash(new Error("slot 0 crashed"));

    expect(slot0LeaseAEvents).toEqual([{ type: "error", message: "slot 0 crashed" }]);
    expect(slot0LeaseBEvents).toEqual([{ type: "error", message: "slot 0 crashed" }]);
    expect(slot0Errors).toEqual([expect.objectContaining({ message: "slot 0 crashed" })]);
    expect(slot1Events).toEqual([]);
    expect(pool.activeLeaseCount()).toBe(1);

    workers[1]?.emit({
      runtimeId: slot1Lease.runtimeId,
      event: { type: "ready", epoch: 1 }
    });
    expect(slot1Events).toEqual([{ type: "ready", epoch: 1 }]);

    const replacement = pool.acquire(context);
    expect(replacement.runtimeId).toBe(4);
    expect(replacement.generation).toBe(oldGeneration + 1);
    expect(replacement.worker).not.toBe(slot0LeaseA.worker);
    expect(workers).toHaveLength(3);
    expect(workers[0]?.terminateCount).toBe(1);

    replacement.release();
    slot1Lease.release();
  });

  it("terminates every physical worker when the pool is disposed", () => {
    const workers: FakePhysicalWorker[] = [];
    const pool = createPool(2, workers);
    const context = {} as never;
    pool.acquire(context);
    pool.acquire(context);

    pool.dispose();
    pool.dispose();

    expect(workers).toHaveLength(2);
    expect(workers.map((worker) => worker.terminateCount)).toEqual([1, 1]);
    expect(pool.activeLeaseCount()).toBe(0);
    expect(() => pool.acquire(context)).toThrow("pool is disposed");
  });

  it("reuses the command envelope and message wrapper on the hot path", () => {
    const workers: FakePhysicalWorker[] = [];
    const pool = createPool(1, workers);
    const lease = pool.acquire({} as never);
    const physical = workers[0];
    const eventWrappers: Array<{ readonly data: MmdRuntimeWorkerEvent }> = [];

    lease.worker.addEventListener?.("message", (event) => eventWrappers.push(event));
    lease.worker.postMessage({ type: "tick", epoch: 0, seconds: 0 });
    const firstEnvelope = physical?.commands[0];
    lease.worker.postMessage({ type: "seek", epoch: 1, seconds: 1 });
    const secondEnvelope = physical?.commands[1];

    expect(firstEnvelope).toBe(secondEnvelope);
    expect(firstEnvelope?.runtimeId).toBe(lease.runtimeId);
    expect(firstEnvelope?.command.type).toBe("seek");

    physical?.emit({
      runtimeId: lease.runtimeId,
      event: { type: "ready", epoch: 0 }
    });
    physical?.emit({
      runtimeId: lease.runtimeId,
      event: { type: "ready", epoch: 1 }
    });
    expect(eventWrappers).toHaveLength(2);
    expect(eventWrappers[0]).toBe(eventWrappers[1]);
    lease.release();
  });
});

function createPool(size: number, workers: FakePhysicalWorker[]): MmdRuntimeWorkerPool {
  return new MmdRuntimeWorkerPool({
    size,
    workerFactory: () => {
      const worker = new FakePhysicalWorker();
      workers.push(worker);
      return worker;
    }
  });
}

class FakePhysicalWorker implements MmdRuntimeWorkerLike {
  readonly commands: MmdRuntimeWorkerCommandEnvelope[] = [];
  readonly runtimeIds: number[] = [];
  readonly commandTypes: MmdRuntimeWorkerCommand["type"][] = [];
  terminateCount = 0;
  private messageListener: ((event: MmdRuntimeWorkerEvent) => void) | undefined;
  private errorListener: ((error: unknown) => void) | undefined;

  postMessage(message: MmdRuntimeWorkerCommandEnvelope | MmdRuntimeWorkerCommand): void {
    if ("runtimeId" in message) {
      this.commands.push(message);
      this.runtimeIds.push(message.runtimeId);
      this.commandTypes.push(message.command.type);
    }
  }

  on(type: string, listener: (event: MmdRuntimeWorkerEvent) => void): void {
    if (type === "message") {
      this.messageListener = listener;
    } else if (type === "error") {
      this.errorListener = listener as unknown as (error: unknown) => void;
    }
  }

  off(type: string): void {
    if (type === "message") {
      this.messageListener = undefined;
    } else if (type === "error") {
      this.errorListener = undefined;
    }
  }

  terminate(): void {
    this.terminateCount += 1;
  }

  emit(envelope: MmdRuntimeWorkerEventEnvelope): void {
    this.messageListener?.(envelope as unknown as MmdRuntimeWorkerEvent);
  }

  crash(error: unknown): void {
    this.errorListener?.(error);
  }
}
