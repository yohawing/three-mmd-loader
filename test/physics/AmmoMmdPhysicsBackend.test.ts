import { describe, expect, it } from "vitest";

import {
  AmmoMmdPhysicsBackend,
  createAmmoMmdPhysicsBackend,
  type AmmoNamespace,
  type MmdPhysicsStepContext
} from "../../src/physics/index.js";

describe("AmmoMmdPhysicsBackend", () => {
  it("initializes Ammo in Node.js and follows the concrete backend lifecycle gate", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, -9.8, 0],
      fixedTimeStep: 1 / 60,
      maxSubSteps: 4
    });
    const context = createStepContext();

    expect(backend).toBeInstanceOf(AmmoMmdPhysicsBackend);
    expect(backend.disabled).toBe(false);
    expect(backend.disposed).toBe(false);

    const first = backend.step(context);
    expect(first.simulated).toBe(false);

    for (let frame = 1; frame <= 20; frame += 1) {
      backend.step({
        ...context,
        seconds: frame / 60,
        deltaSeconds: 1 / 60,
        frame
      });
    }
    const { translations, rotations } = context.output;

    expect(translations).toBeDefined();
    expect(rotations).toBeDefined();
    expect(Array.from(translations ?? []).every(Number.isFinite)).toBe(true);
    expect(Array.from(rotations ?? []).every(Number.isFinite)).toBe(true);
    expect(translations?.[1]).toBeLessThan(0);
    expect(backend.diagnostics?.()[0]?.code).toBe("PHYSICS_BACKEND_AMMO_EXPERIMENTAL");

    backend.reset?.({ seconds: 0, frame: 0, frameRate: 60 });
    expect(backend.disposed).toBe(false);

    backend.dispose?.();
    expect(backend.disposed).toBe(true);
    expect(backend.step(context)).toEqual({
      simulated: false,
      diagnostics: [
        {
          level: "warning",
          code: "PHYSICS_BACKEND_AMMO_EXPERIMENTAL",
          message:
            "Ammo physics backend is experimental and currently provides smoke-level MMD rigid-body support without native numeric equivalence."
        },
        {
          level: "warning",
          code: "PHYSICS_BACKEND_DISPOSED",
          message: "Physics backend has been disposed."
        }
      ]
    });
  });
});

function createStepContext(): MmdPhysicsStepContext {
  const inputTranslations = new Float32Array([0, 0, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
  return {
    seconds: 0,
    deltaSeconds: 0,
    frame: 0,
    frameRate: 60,
    skeleton: {
      bones: [
        {
          index: 0,
          name: "bone",
          parentIndex: -1,
          restTranslation: [0, 0, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      {
        index: 0,
        name: "body",
        boneIndex: 0,
        motionType: "dynamic",
        shape: {
          type: "sphere",
          size: [0.25, 0.25, 0.25]
        },
        localTranslation: [0, 1, 0],
        localRotation: [0, 0, 0, 1],
        mass: 1,
        linearDamping: 0,
        angularDamping: 0,
        restitution: 0,
        friction: 0.5,
        collisionGroup: 0,
        collisionMask: 0xffff
      }
    ],
    joints: [],
    inputTranslations,
    inputRotations,
    inputWorldMatricesColumnMajor,
    output: {
      translations: new Float32Array(inputTranslations),
      rotations: new Float32Array(inputRotations),
      worldMatricesColumnMajor: new Float32Array(inputWorldMatricesColumnMajor),
      updatedBoneIndices: []
    }
  };
}
