import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAmmoNamespace, type AmmoNamespace } from "../../../src/physics/index.js";

describe("loadAmmoNamespace", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns an existing Ammo namespace without injecting a script", async () => {
    const ammo = createAmmoNamespace();
    vi.stubGlobal("Ammo", ammo);

    await expect(loadAmmoNamespace("/ammo.js")).resolves.toBe(ammo);
  });

  it("injects a script and initializes an Ammo factory global", async () => {
    const dom = installMockDom();
    const ammo = createAmmoNamespace();
    const promise = loadAmmoNamespace("/ammo.js");

    expect(dom.scripts[0]?.src).toBe("/ammo.js");
    vi.stubGlobal("Ammo", () => Promise.resolve(ammo));
    dom.scripts[0]?.dispatch("load");

    await expect(promise).resolves.toBe(ammo);
  });

  it("rejects script load failures", async () => {
    const dom = installMockDom();
    const promise = loadAmmoNamespace("/missing-ammo.js");
    const rejection = expect(promise).rejects.toThrow("Failed to load /missing-ammo.js");

    dom.scripts[0]?.dispatch("error");

    await rejection;
  });

  it("matches window error events without a global location object", async () => {
    const dom = installMockDom({ locationHref: undefined });
    const cause = new Error("ammo init failed");
    const promise = loadAmmoNamespace("/missing-ammo.js");
    const rejection = expect(promise).rejects.toThrow(cause);

    dom.window.dispatchError({
      error: cause,
      filename: "http://localhost/missing-ammo.js",
      message: cause.message
    });

    await rejection;
  });

  it("rejects when the script load times out", async () => {
    vi.useFakeTimers();
    installMockDom();
    const promise = loadAmmoNamespace("/slow-ammo.js", { timeoutMs: 50 });
    const rejection = expect(promise).rejects.toThrow("Timed out loading /slow-ammo.js");

    await vi.advanceTimersByTimeAsync(50);

    await rejection;
  });
});

function createAmmoNamespace(): AmmoNamespace {
  return {
    btDefaultCollisionConfiguration: class {},
    btCollisionDispatcher: class {
      constructor(_configuration: object) {}
    },
    btDbvtBroadphase: class {},
    btSequentialImpulseConstraintSolver: class {},
    btDiscreteDynamicsWorld: class {
      constructor(
        _dispatcher: object,
        _broadphase: object,
        _solver: object,
        _configuration: object
      ) {}
      setGravity(): void {}
      addRigidBody(): void {}
      stepSimulation(): void {}
    },
    btVector3: class {
      constructor(_x: number, _y: number, _z: number) {}
      x(): number {
        return 0;
      }
      y(): number {
        return 0;
      }
      z(): number {
        return 0;
      }
      setValue(): void {}
      op_mul(): void {}
    },
    btTransform: class {
      setIdentity(): void {}
      getOrigin(): { setValue(): void } {
        return { setValue() {} };
      }
      setOrigin(): void {}
      getRotation(): { x(): number; y(): number; z(): number; w(): number } {
        return { x: () => 0, y: () => 0, z: () => 0, w: () => 1 };
      }
      setRotation(): void {}
    },
    btDefaultMotionState: class {
      constructor(_transform: object) {}
      getWorldTransform(): void {}
      setWorldTransform(): void {}
    },
    btRigidBodyConstructionInfo: class {
      constructor(_mass: number, _motionState: object, _shape: object, _inertia: object) {}
    },
    btRigidBody: class {
      constructor(_info: object) {}
      getMotionState(): object {
        return {};
      }
      setWorldTransform(): void {}
      getWorldTransform(): object {
        return {};
      }
      setLinearVelocity(): void {}
      setAngularVelocity(): void {}
      setDamping(): void {}
      setFriction(): void {}
      setRestitution(): void {}
      setActivationState(): void {}
      activate(): void {}
    },
    btBoxShape: class {
      constructor(_halfExtents: object) {}
      calculateLocalInertia(): void {}
    },
    btCapsuleShape: class {
      constructor(_radius: number, _height: number) {}
      calculateLocalInertia(): void {}
    },
    btSphereShape: class {
      constructor(_radius: number) {}
      calculateLocalInertia(): void {}
    }
  } as AmmoNamespace;
}

function installMockDom(
  options: { readonly locationHref?: string | undefined } = {
    locationHref: "https://example.test/viewer/"
  }
): { scripts: MockScript[]; window: MockWindow } {
  const scripts: MockScript[] = [];
  const windowMock = new MockWindow(options.locationHref);
  vi.stubGlobal("window", windowMock);
  if (options.locationHref !== undefined) {
    vi.stubGlobal("location", { href: options.locationHref });
  }
  vi.stubGlobal("document", {
    createElement(tagName: string) {
      expect(tagName).toBe("script");
      return new MockScript();
    },
    head: {
      appendChild(script: MockScript) {
      scripts.push(script);
      }
    }
  });
  return { scripts, window: windowMock };
}

class MockWindow {
  readonly setTimeout = globalThis.setTimeout.bind(globalThis);
  readonly clearTimeout = globalThis.clearTimeout.bind(globalThis);
  readonly queueMicrotask = globalThis.queueMicrotask.bind(globalThis);
  readonly location: { href: string } | undefined;
  private readonly listeners = new Map<string, Set<(event: ErrorEvent) => void>>();

  constructor(locationHref: string | undefined) {
    this.location = locationHref === undefined ? undefined : { href: locationHref };
  }

  addEventListener(type: string, listener: (event: ErrorEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: ErrorEvent) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: ErrorEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchError(eventInit: { readonly error: Error; readonly filename: string; readonly message: string }): void {
    const event = {
      ...eventInit,
      preventDefault: vi.fn()
    } as unknown as ErrorEvent;
    for (const listener of this.listeners.get("error") ?? []) {
      listener(event);
    }
  }
}

class MockScript {
  async = false;
  src = "";
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}
