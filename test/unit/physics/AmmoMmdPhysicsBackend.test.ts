import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

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

  it("keeps dynamicWithBone output translation on the animated bone by default", async () => {
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

  it("removes the rigid-body offset before feeding dynamicWithBone rotation back to the bone", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, 0, 0],
      fixedTimeStep: 1 / 60,
      maxSubSteps: 0,
      resetCatchUpSteps: 0
    });
    const context = createDynamicWithBoneRotatedOffsetStepContext();

    backend.step(context);

    expect(canonicalQuaternion(Array.from(context.output.rotations.slice(0, 4))).map(round6)).toEqual([
      0.707107, 0, 0, 0.707107
    ]);
    expect(Array.from(context.output.translations.slice(0, 3)).map(round6)).toEqual([0, 0, 0]);
    backend.dispose?.();
  });

  it("can attach dynamicWithBone output translation to the physics body for visual correction", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, 0, 0],
      fixedTimeStep: 1 / 60,
      maxSubSteps: 1,
      resetCatchUpSteps: 0,
      dynamicWithBoneTranslationFeedbackScale: 1
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
    expect(Math.abs(context.output.translations[0])).toBeLessThan(0.001);
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

  it("keeps connected rigid-body contacts enabled by default and allows Three.js-compatible disable", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const defaultBackend = new AmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, 0, 0],
      fixedTimeStep: 1 / 60,
      maxSubSteps: 1,
      resetCatchUpSteps: 0
    });
    const strictThreeBackend = new AmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, 0, 0],
      fixedTimeStep: 1 / 60,
      maxSubSteps: 1,
      resetCatchUpSteps: 0,
      disableCollisionsBetweenLinkedBodies: true
    });
    try {
      expect(await countLinkedOverlapContacts(defaultBackend)).toBeGreaterThan(0);
      expect(await countLinkedOverlapContacts(strictThreeBackend)).toBe(0);
    } finally {
      defaultBackend.dispose();
      strictThreeBackend.dispose();
    }
  });

  it("keeps a falling dynamic body above a static collision body without deep penetration", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, -9.8, 0],
      fixedTimeStep: 1 / 120,
      maxSubSteps: 8,
      resetCatchUpSteps: 0,
      solverIterations: 20
    });
    const context = createStaticCollisionStepContext();

    backend.step(context);
    for (let frame = 1; frame <= 180; frame += 1) {
      context.output.updatedBoneIndices.length = 0;
      const result = backend.step({
        ...context,
        seconds: frame / 60,
        deltaSeconds: 1 / 60,
        frame,
        debug: {
          captureContacts: true
        }
      });
      if (result.debug?.contacts?.length) {
        expect(result.debug.contacts[0]?.distance).toBeGreaterThan(-0.08);
      }
    }

    const dynamicY = context.output.translations[3 + 1];
    expect(dynamicY).toBeGreaterThanOrEqual(0.4);
    backend.dispose?.();
  });

  it("damps a constrained dynamicWithBone chain without frame-to-frame spikes", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const backend = createAmmoMmdPhysicsBackend(Ammo, {
      gravity: [0, -9.8, 0],
      fixedTimeStep: 1 / 120,
      maxSubSteps: 8,
      resetCatchUpSteps: 0,
      solverIterations: 20,
      dynamicWithBoneRotationFeedbackScale: 0.25,
      dynamicWithBoneTranslationFeedbackScale: 0.1
    });
    const context = createDynamicWithBoneChainStepContext();
    let previousTipY = context.output.worldMatricesColumnMajor[2 * 16 + 13];
    let largestDelta = 0;

    backend.step(context);
    for (let frame = 1; frame <= 120; frame += 1) {
      writeChainRootMotion(context, Math.sin(frame / 12) * 0.15);
      context.output.updatedBoneIndices.length = 0;
      backend.step({
        ...context,
        seconds: frame / 60,
        deltaSeconds: 1 / 60,
        frame
      });
      const tipY = context.output.worldMatricesColumnMajor[2 * 16 + 13];
      largestDelta = Math.max(largestDelta, Math.abs(tipY - previousTipY));
      previousTipY = tipY;
    }

    expect(Array.from(context.output.translations).every(Number.isFinite)).toBe(true);
    expect(largestDelta).toBeLessThan(0.35);
    expect(context.output.worldMatricesColumnMajor[2 * 16 + 13]).toBeGreaterThan(0.55);
    backend.dispose?.();
  });
});

describe("AmmoMmdPhysicsBackend source guards", () => {
  it("keeps MMD-family solver defaults for gravity, substeps, constraints, and damping", async () => {
    const source = (await readFile("src/physics/ammoMmdPhysicsBackend.ts", "utf8")).replace(
      /\r\n/g,
      "\n"
    );

    expect(source).toContain("const DEFAULT_GRAVITY: [number, number, number] = [0, -98, 0];");
    expect(source).toContain("const DEFAULT_FIXED_TIME_STEP = 1 / 65;");
    expect(source).toContain("const DEFAULT_MAX_SUB_STEPS = 3;");
    expect(source).toContain("info.set_m_additionalDamping?.(this.options.additionalDamping ?? true);");
    expect(source).toContain("rigidBody.setActivationState?.(DISABLE_DEACTIVATION);");
    expect(source).toContain("rigidBody.getCenterOfMassTransform()");
    expect(source).toContain("transform.getRotationX()");
    expect(source).not.toContain("this.destroy(rotation);");
    expect(source).toContain(
      "world.addConstraint(constraint, this.options.disableCollisionsBetweenLinkedBodies ?? false);"
    );
    expect(source).toContain("if (stiffness !== 0) {\n        constraint.enableSpring(constraintAxis, true);");
  });

  it("documents the local dynamicWithBone visual-sync override separately from nanoem parity", async () => {
    const source = await readFile("src/physics/ammoMmdPhysicsBackend.ts", "utf8");

    expect(source).toContain("const DYNAMIC_WITH_BONE_TRANSLATION_FEEDBACK_SCALE = 0;");
    expect(source).toContain("nanoem and Babylon-MMD preserve dynamic-with-bone translation");
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

async function countLinkedOverlapContacts(backend: AmmoMmdPhysicsBackend): Promise<number> {
  const context = createLinkedOverlapStepContext();
  backend.step(context);
  for (let frame = 1; frame <= 3; frame += 1) {
    backend.step({
      ...context,
      seconds: frame / 60,
      deltaSeconds: 1 / 60,
      frame
    });
  }
  return backend
    .debugPhysicsContacts()
    .filter(
      (contact) =>
        (contact.rigidBodyIndexA === 0 && contact.rigidBodyIndexB === 1) ||
        (contact.rigidBodyIndexA === 1 && contact.rigidBodyIndexB === 0)
    ).length;
}

function createLinkedOverlapStepContext(): MmdPhysicsStepContext {
  const inputTranslations = new Float32Array([0, 0, 0, 0.35, 0, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.35, 0, 0, 1
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
          name: "linked-a",
          parentIndex: -1,
          restTranslation: [0, 0, 0],
          restRotation: [0, 0, 0, 1]
        },
        {
          index: 1,
          name: "linked-b",
          parentIndex: -1,
          restTranslation: [0.35, 0, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      {
        ...createRigidBody(0, "linked-body-a", 0, [0, 0, 0]),
        shape: { type: "sphere", size: [0.3, 0.3, 0.3] },
        linearDamping: 1,
        angularDamping: 1
      },
      {
        ...createRigidBody(1, "linked-body-b", 1, [0.35, 0, 0]),
        shape: { type: "sphere", size: [0.3, 0.3, 0.3] },
        linearDamping: 1,
        angularDamping: 1
      }
    ],
    joints: [
      {
        index: 0,
        name: "linked-joint",
        rigidBodyIndexA: 0,
        rigidBodyIndexB: 1,
        translation: [0.175, 0, 0],
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
          linear: [0, 0, 0],
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

function createStaticCollisionStepContext(): MmdPhysicsStepContext {
  const inputTranslations = new Float32Array([0, 0, 0, 0, 1.4, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.4, 0, 1
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
          name: "static-collider",
          parentIndex: -1,
          restTranslation: [0, 0, 0],
          restRotation: [0, 0, 0, 1]
        },
        {
          index: 1,
          name: "dynamic-skirt",
          parentIndex: -1,
          restTranslation: [0, 1.4, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      {
        index: 0,
        name: "leg-collider",
        boneIndex: 0,
        motionType: "static",
        shape: {
          type: "box",
          size: [0.45, 0.2, 0.45]
        },
        localTranslation: [0, 0, 0],
        localRotation: [0, 0, 0, 1],
        mass: 0,
        linearDamping: 0,
        angularDamping: 0,
        restitution: 0,
        friction: 0.9,
        collisionGroup: 0,
        collisionMask: 0xffff
      },
      {
        index: 1,
        name: "skirt-body",
        boneIndex: 1,
        motionType: "dynamic",
        shape: {
          type: "sphere",
          size: [0.28, 0.28, 0.28]
        },
        localTranslation: [0, 1.4, 0],
        localRotation: [0, 0, 0, 1],
        mass: 1,
        linearDamping: 0.5,
        angularDamping: 0.5,
        restitution: 0,
        friction: 0.8,
        collisionGroup: 1,
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

function createDynamicWithBoneChainStepContext(): MmdPhysicsStepContext {
  const inputTranslations = new Float32Array([0, 1.8, 0, 0, -0.45, 0, 0, -0.45, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.8, 0, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.35, 0, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.9, 0, 1
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
          name: "twin-tail-root",
          parentIndex: -1,
          restTranslation: [0, 1.8, 0],
          restRotation: [0, 0, 0, 1]
        },
        {
          index: 1,
          name: "twin-tail-mid",
          parentIndex: 0,
          restTranslation: [0, -0.45, 0],
          restRotation: [0, 0, 0, 1]
        },
        {
          index: 2,
          name: "twin-tail-tip",
          parentIndex: 1,
          restTranslation: [0, -0.45, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      {
        ...createRigidBody(0, "tail-root-body", 0, [0, 1.8, 0]),
        motionType: "static",
        shape: { type: "sphere", size: [0.16, 0.16, 0.16] },
        mass: 0
      },
      {
        ...createRigidBody(1, "tail-mid-body", 1, [0, 1.35, 0]),
        motionType: "dynamicWithBone",
        shape: { type: "capsule", size: [0.08, 0.35, 0.08] },
        linearDamping: 0.6,
        angularDamping: 0.7
      },
      {
        ...createRigidBody(2, "tail-tip-body", 2, [0, 0.9, 0]),
        motionType: "dynamicWithBone",
        shape: { type: "capsule", size: [0.08, 0.35, 0.08] },
        linearDamping: 0.6,
        angularDamping: 0.7
      }
    ],
    joints: [
      createChainJoint(0, 0, 1, [0, 1.55, 0]),
      createChainJoint(1, 1, 2, [0, 1.1, 0])
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

function createDynamicWithBoneRotatedOffsetStepContext(): MmdPhysicsStepContext {
  const boneRotation: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  const bodyOffsetRotation: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
  const inputTranslations = new Float32Array([0, 0, 0]);
  const inputRotations = new Float32Array(boneRotation);
  const inputWorldMatricesColumnMajor = new Float32Array(16);
  writeWorldMatrix(inputWorldMatricesColumnMajor, 0, [0, 0, 0], boneRotation);
  return {
    seconds: 0,
    deltaSeconds: 0,
    frame: 0,
    frameRate: 60,
    skeleton: {
      bones: [
        {
          index: 0,
          name: "dynamic-with-bone",
          parentIndex: -1,
          restTranslation: [0, 0, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      {
        ...createRigidBody(0, "rotated-offset-body", 0, [0, 0, 0]),
        motionType: "dynamicWithBone",
        localRotation: bodyOffsetRotation
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

function writeChainRootMotion(context: MmdPhysicsStepContext, rootX: number): void {
  writeBoneTranslation(context, 0, [rootX, 1.8, 0]);
  writeBoneTranslation(context, 1, [0, -0.45, 0]);
  writeBoneTranslation(context, 2, [0, -0.45, 0]);
  writeWorldMatrixTranslation(context.inputWorldMatricesColumnMajor, 0, [rootX, 1.8, 0]);
  writeWorldMatrixTranslation(context.inputWorldMatricesColumnMajor, 1, [rootX, 1.35, 0]);
  writeWorldMatrixTranslation(context.inputWorldMatricesColumnMajor, 2, [rootX, 0.9, 0]);
}

function createChainJoint(
  index: number,
  rigidBodyIndexA: number,
  rigidBodyIndexB: number,
  translation: [number, number, number]
): NonNullable<MmdPhysicsStepContext["joints"]>[number] {
  return {
    index,
    name: `chain-${index}`,
    rigidBodyIndexA,
    rigidBodyIndexB,
    translation,
    rotation: [0, 0, 0, 1],
    linearLimit: {
      lower: [-0.03, -0.03, -0.03],
      upper: [0.03, 0.03, 0.03]
    },
    angularLimit: {
      lower: [-0.35, -0.35, -0.35],
      upper: [0.35, 0.35, 0.35]
    },
    spring: {
      linear: [120, 120, 120],
      angular: [5, 5, 5]
    }
  };
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

function writeWorldMatrixTranslation(
  buffer: Float32Array,
  boneIndex: number,
  translation: [number, number, number]
): void {
  writeWorldMatrix(buffer, boneIndex, translation, [0, 0, 0, 1]);
}

function writeWorldMatrix(
  buffer: Float32Array,
  boneIndex: number,
  translation: [number, number, number],
  rotation: [number, number, number, number]
): void {
  const matrixOffset = boneIndex * 16;
  const [x, y, z, w] = rotation;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  buffer[matrixOffset] = 1 - (yy + zz);
  buffer[matrixOffset + 1] = xy + wz;
  buffer[matrixOffset + 2] = xz - wy;
  buffer[matrixOffset + 3] = 0;
  buffer[matrixOffset + 4] = xy - wz;
  buffer[matrixOffset + 5] = 1 - (xx + zz);
  buffer[matrixOffset + 6] = yz + wx;
  buffer[matrixOffset + 7] = 0;
  buffer[matrixOffset + 8] = xz + wy;
  buffer[matrixOffset + 9] = yz - wx;
  buffer[matrixOffset + 10] = 1 - (xx + yy);
  buffer[matrixOffset + 11] = 0;
  buffer[matrixOffset + 12] = translation[0];
  buffer[matrixOffset + 13] = translation[1];
  buffer[matrixOffset + 14] = translation[2];
  buffer[matrixOffset + 15] = 1;
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function canonicalQuaternion(values: number[]): number[] {
  const sign = values[3] < 0 ? -1 : 1;
  return values.map((value) => value * sign);
}
