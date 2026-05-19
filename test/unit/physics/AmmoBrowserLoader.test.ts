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

function installMockDom(): { scripts: MockScript[] } {
  const scripts: MockScript[] = [];
  const windowMock = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    queueMicrotask: globalThis.queueMicrotask.bind(globalThis),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
  vi.stubGlobal("window", windowMock);
  vi.stubGlobal("location", { href: "https://example.test/viewer/" });
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
  return { scripts };
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
