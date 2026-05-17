import { describe, expect, it } from "vitest";

import {
  AmmoMmdPhysicsBackend,
  createAmmoMmdPhysicsBackend,
  type AmmoNamespace,
  type MmdPhysicsStepContext
} from "../../../src/physics/index.js";

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

  it("destroys Ammo-owned world resources on reset and dispose", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const originalDestroy = Ammo.destroy?.bind(Ammo);
    const destroyCalls: object[] = [];
    const trackedAmmo = Object.create(Ammo) as AmmoNamespace;
    trackedAmmo.destroy = (value: object) => {
      destroyCalls.push(value);
      originalDestroy?.(value);
    };

    const resetBackend = createAmmoMmdPhysicsBackend(trackedAmmo);
    resetBackend.step(createStepContext());
    const beforeReset = destroyCalls.length;
    resetBackend.reset?.({ seconds: 0, frame: 0, frameRate: 60 });
    expect(destroyCalls.length).toBeGreaterThan(beforeReset);

    const disposeBackend = createAmmoMmdPhysicsBackend(trackedAmmo);
    disposeBackend.step(createStepContext());
    const beforeDispose = destroyCalls.length;
    disposeBackend.dispose?.();
    expect(destroyCalls.length).toBeGreaterThan(beforeDispose);
  });

  it("syncs dynamic rigid bodies in stable bone hierarchy order", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, 0, 0],
      fixedTimeStep: 1 / 60,
      maxSubSteps: 0
    });
    const context = createHierarchyStepContext();

    backend.step(context);

    expect(Array.from(context.output.translations ?? [])).toEqual([0, 0, -0, 1, 0, 0]);
    expect(context.output.updatedBoneIndices).toEqual([0, 1]);
    backend.dispose?.();
  });

  it("resets dynamic rigid bodies to the current bone pose instead of the rest pose", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, 0, 0],
      fixedTimeStep: 1 / 60,
      maxSubSteps: 0,
      resetCatchUpSteps: 0
    });
    const context = createStepContext();

    backend.step(context);
    writeBoneTranslation(context, 0, [0, 5, 0]);
    context.output.translations.fill(0);
    context.output.rotations.fill(0);
    context.output.worldMatricesColumnMajor.fill(0);
    context.output.updatedBoneIndices.length = 0;
    backend.reset?.({ seconds: context.seconds, frame: context.frame, frameRate: context.frameRate });

    const resetStep = backend.step(context);

    expect(resetStep.simulated).toBe(false);
    expect(Array.from(context.output.translations ?? [])).toEqual([0, 0, 0]);
    expect(context.output.updatedBoneIndices).toEqual([]);
    backend.dispose?.();
  });
});

describe("AmmoMmdPhysicsBackend smoke coverage", () => {
  it("moves a Generic6DofSpring constrained body in the expected direction on the next frame", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, 0, 0],
      fixedTimeStep: 1 / 60,
      maxSubSteps: 1,
      resetCatchUpSteps: 0
    });
    const context = createSpringStepContext();
    const initialDynamicX = context.output.translations[3];

    backend.step(context);
    writeBoneTranslation(context, 0, [0.25, 0, 0]);
    context.output.updatedBoneIndices.length = 0;
    for (let frame = 1; frame <= 10; frame += 1) {
      backend.step({
        ...context,
        seconds: frame / 60,
        deltaSeconds: 1 / 60,
        frame
      });
    }

    const dynamicX = context.output.translations[3];
    expect(Array.from(context.output.translations).every(Number.isFinite)).toBe(true);
    expect(dynamicX).toBeGreaterThan(initialDynamicX);
    backend.dispose?.();
  });

  it("keeps dynamicWithBone output translation following the input bone motion direction", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, 0, 0],
      fixedTimeStep: 1 / 60,
      maxSubSteps: 1,
      resetCatchUpSteps: 0
    });
    const context = createDynamicWithBoneStepContext();

    backend.step(context);
    writeBoneTranslation(context, 0, [0.5, 0, 0]);
    context.output.updatedBoneIndices.length = 0;
    backend.step({
      ...context,
      seconds: 1 / 60,
      deltaSeconds: 1 / 60,
      frame: 1
    });

    expect(Array.from(context.output.translations).every(Number.isFinite)).toBe(true);
    expect(context.output.translations[0]).toBeGreaterThan(0);
    expect(context.output.updatedBoneIndices).toContain(0);
    backend.dispose?.();
  });

  it("can bypass the legacy HEAP32 additional damping patch for build validation", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      additionalDampingPatch: true,
      disableAdditionalDampingPatch: true
    });
    const context = createStepContext();

    backend.step(context);
    for (let frame = 1; frame <= 20; frame += 1) {
      backend.step({
        ...context,
        seconds: frame / 60,
        deltaSeconds: 1 / 60,
        frame
      });
    }

    expect(Array.from(context.output.translations).every(Number.isFinite)).toBe(true);
    expect(Array.from(context.output.rotations).every(Number.isFinite)).toBe(true);
    backend.dispose?.();
  });
});

function createStepContext(): MmdPhysicsStepContext {
  const inputTranslations = new Float32Array([0, 0, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
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

function createHierarchyStepContext(): MmdPhysicsStepContext {
  const inputTranslations = new Float32Array([0, 0, 0, 1, 0, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1
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
          name: "parent",
          parentIndex: -1,
          restTranslation: [0, 0, 0],
          restRotation: [0, 0, 0, 1]
        },
        {
          index: 1,
          name: "child",
          parentIndex: 0,
          restTranslation: [1, 0, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      createRigidBody(0, "childBody", 1, [2, 0, 0]),
      createRigidBody(1, "parentBody", 0, [1, 0, 0])
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

function createSpringStepContext(): MmdPhysicsStepContext {
  const inputTranslations = new Float32Array([0, 0, 0, 1, 0, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1
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
          name: "anchor",
          parentIndex: -1,
          restTranslation: [0, 0, 0],
          restRotation: [0, 0, 0, 1]
        },
        {
          index: 1,
          name: "dynamic",
          parentIndex: -1,
          restTranslation: [1, 0, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      {
        index: 0,
        name: "anchorBody",
        boneIndex: 0,
        motionType: "static",
        shape: {
          type: "sphere",
          size: [0.2, 0.2, 0.2]
        },
        localTranslation: [0, 0, 0],
        localRotation: [0, 0, 0, 1],
        mass: 0,
        linearDamping: 0,
        angularDamping: 0,
        restitution: 0,
        friction: 0.5,
        collisionGroup: 0,
        collisionMask: 0xffff
      },
      {
        index: 1,
        name: "springBody",
        boneIndex: 1,
        motionType: "dynamic",
        shape: {
          type: "sphere",
          size: [0.2, 0.2, 0.2]
        },
        localTranslation: [1, 0, 0],
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
    joints: [
      {
        index: 0,
        name: "spring",
        rigidBodyIndexA: 0,
        rigidBodyIndexB: 1,
        translation: [0.5, 0, 0],
        rotation: [0, 0, 0, 1],
        linearLimit: {
          lower: [0, 0, 0],
          upper: [0, 0, 0]
        },
        angularLimit: {
          lower: [0, 0, 0],
          upper: [0, 0, 0]
        },
        spring: {
          linear: [80, 0, 0],
          angular: [0, 0, 0]
        }
      }
    ],
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

function createDynamicWithBoneStepContext(): MmdPhysicsStepContext {
  const context = createStepContext();
  context.rigidBodies[0] = {
    ...context.rigidBodies[0],
    motionType: "dynamicWithBone",
    localTranslation: [0, 0, 0],
    mass: 1
  };
  return context;
}

function createRigidBody(
  index: number,
  name: string,
  boneIndex: number,
  localTranslation: [number, number, number]
): NonNullable<MmdPhysicsStepContext["rigidBodies"]>[number] {
  return {
    index,
    name,
    boneIndex,
    motionType: "dynamic",
    shape: {
      type: "sphere",
      size: [0.25, 0.25, 0.25]
    },
    localTranslation,
    localRotation: [0, 0, 0, 1],
    mass: 1,
    linearDamping: 0,
    angularDamping: 0,
    restitution: 0,
    friction: 0.5,
    collisionGroup: 0,
    collisionMask: 0xffff
  };
}

function writeBoneTranslation(
  context: MmdPhysicsStepContext,
  boneIndex: number,
  translation: [number, number, number]
): void {
  const translationOffset = boneIndex * 3;
  context.inputTranslations[translationOffset] = translation[0];
  context.inputTranslations[translationOffset + 1] = translation[1];
  context.inputTranslations[translationOffset + 2] = translation[2];
  const matrixOffset = boneIndex * 16;
  context.inputWorldMatricesColumnMajor[matrixOffset] = 1;
  context.inputWorldMatricesColumnMajor[matrixOffset + 5] = 1;
  context.inputWorldMatricesColumnMajor[matrixOffset + 10] = 1;
  context.inputWorldMatricesColumnMajor[matrixOffset + 12] = translation[0];
  context.inputWorldMatricesColumnMajor[matrixOffset + 13] = translation[1];
  context.inputWorldMatricesColumnMajor[matrixOffset + 14] = translation[2];
  context.inputWorldMatricesColumnMajor[matrixOffset + 15] = 1;
}
