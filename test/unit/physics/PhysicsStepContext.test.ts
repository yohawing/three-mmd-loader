import { describe, expect, it } from "vitest";

import {
  normalizeMmdPhysicsDebugSnapshot,
  summarizeMmdPhysicsStepContext,
  validateConcreteMmdPhysicsStepContext,
  validateMmdPhysicsStepContext,
  type MmdPhysicsStepContext
} from "../../../src/physics/index.js";

function createValidStepContext(): MmdPhysicsStepContext {
  return {
    seconds: 1,
    deltaSeconds: 1 / 60,
    frame: 30,
    frameRate: 30,
    skeleton: {
      bones: [
        {
          index: 0,
          name: "center",
          parentIndex: -1,
          restTranslation: [0, 10, 0],
          restRotation: [0, 0, 0, 1]
        },
        {
          index: 1,
          name: "head",
          parentIndex: 0,
          restTranslation: [0, 20, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      {
        index: 0,
        name: "center-body",
        boneIndex: 0,
        motionType: "dynamicWithBone",
        shape: { type: "sphere", size: [1, 1, 1] },
        localTranslation: [0, 0, 0],
        localRotation: [0, 0, 0, 1],
        mass: 1,
        linearDamping: 0.5,
        angularDamping: 0.5,
        restitution: 0,
        friction: 0.5,
        collisionGroup: 1,
        collisionMask: 0xffff
      },
      {
        index: 1,
        name: "head-body",
        boneIndex: 1,
        motionType: "dynamic",
        shape: { type: "capsule", size: [0.5, 1, 0.5] }
      }
    ],
    joints: [
      {
        index: 0,
        name: "neck-joint",
        rigidBodyIndexA: 0,
        rigidBodyIndexB: 1,
        translation: [0, 15, 0],
        rotation: [0, 0, 0, 1],
        linearLimit: { lower: [-1, -1, -1], upper: [1, 1, 1] },
        angularLimit: { lower: [-0.5, -0.5, -0.5], upper: [0.5, 0.5, 0.5] },
        spring: { linear: [0, 0, 0], angular: [0, 0, 0] }
      }
    ],
    inputTranslations: new Float32Array(2 * 3),
    inputRotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
    inputWorldMatricesColumnMajor: new Float32Array(2 * 16),
    output: {
      translations: new Float32Array(2 * 3),
      rotations: new Float32Array(2 * 4),
      worldMatricesColumnMajor: new Float32Array(2 * 16),
      updatedBoneIndices: [0, 1]
    },
    bonePhysicsToggles: new Uint8Array([1, 0]),
    morphImpulses: [
      {
        morphIndex: 0,
        weight: 0.75,
        rigidBodyIndex: 1,
        force: [0, 1, 0],
        torque: [0, 0, 1]
      }
    ]
  };
}

function requireItem<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Missing test fixture item: ${name}`);
  }
  return value;
}

describe("MmdPhysicsStepContext validation", () => {
  it("summarizes concrete backend buffers and collection counts", () => {
    expect(summarizeMmdPhysicsStepContext(createValidStepContext())).toEqual({
      boneCount: 2,
      rigidBodyCount: 2,
      jointCount: 1,
      morphImpulseCount: 1,
      hasInputTranslations: true,
      hasInputRotations: true,
      hasInputWorldMatricesColumnMajor: true,
      hasOutputTranslations: true,
      hasOutputRotations: true,
      hasOutputWorldMatricesColumnMajor: true,
      hasBonePhysicsToggles: true
    });
  });

  it("accepts a fixture-free concrete backend step context", () => {
    const result = validateConcreteMmdPhysicsStepContext(createValidStepContext());

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.summary).toMatchObject({
      boneCount: 2,
      rigidBodyCount: 2,
      jointCount: 1
    });
  });

  it("accepts a minimal generic step context without concrete backend fields", () => {
    const result = validateMmdPhysicsStepContext({
      seconds: 0,
      deltaSeconds: 1 / 60,
      frame: 0,
      frameRate: 30
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.summary).toMatchObject({
      boneCount: 0,
      rigidBodyCount: 0,
      jointCount: 0
    });
  });

  it("reports missing concrete backend collections and buffers", () => {
    const result = validateMmdPhysicsStepContext({
      seconds: 0,
      deltaSeconds: 1 / 60,
      frame: 0,
      frameRate: 30
    }, {
      requireConcreteBackendFields: true
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
      "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
      "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
      "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
      "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
      "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
      "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
      "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
      "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED"
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        "MMD physics step context is missing required skeleton.",
        "MMD physics step context is missing required inputTranslations.",
        "MMD physics step context is missing required output.worldMatricesColumnMajor."
      ])
    );
  });

  it("reports short input and output buffers against the skeleton size", () => {
    const context = {
      ...createValidStepContext(),
      inputTranslations: new Float32Array(5),
      output: {
        translations: new Float32Array(5),
        rotations: new Float32Array(7),
        worldMatricesColumnMajor: new Float32Array(31)
      },
      bonePhysicsToggles: new Uint8Array([1])
    };
    const result = validateMmdPhysicsStepContext(context);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        level: "error",
        code: "PHYSICS_STEP_CONTEXT_BUFFER_TOO_SHORT",
        message: "MMD physics step context inputTranslations must have at least 6 values; got 5."
      },
      {
        level: "error",
        code: "PHYSICS_STEP_CONTEXT_BUFFER_TOO_SHORT",
        message: "MMD physics step context output.translations must have at least 6 values; got 5."
      },
      {
        level: "error",
        code: "PHYSICS_STEP_CONTEXT_BUFFER_TOO_SHORT",
        message: "MMD physics step context output.rotations must have at least 8 values; got 7."
      },
      {
        level: "error",
        code: "PHYSICS_STEP_CONTEXT_BUFFER_TOO_SHORT",
        message:
          "MMD physics step context output.worldMatricesColumnMajor must have at least 32 values; got 31."
      },
      {
        level: "error",
        code: "PHYSICS_STEP_CONTEXT_BUFFER_TOO_SHORT",
        message: "MMD physics step context bonePhysicsToggles must have at least 2 values; got 1."
      }
    ]);
  });

  it("reports non-finite scalar, tuple, and buffer values", () => {
    const context = createValidStepContext();
    const rigidBodies = context.rigidBodies ?? [];
    const firstRigidBody = requireItem(rigidBodies[0], "rigidBodies[0]");
    const secondRigidBody = requireItem(rigidBodies[1], "rigidBodies[1]");

    const broken: MmdPhysicsStepContext = {
      ...context,
      seconds: Number.NaN,
      deltaSeconds: Number.NEGATIVE_INFINITY,
      rigidBodies: [
        {
          ...firstRigidBody,
          shape: { type: "sphere", size: [1, Number.NaN, 1] }
        },
        secondRigidBody
      ],
      inputRotations: new Float32Array([0, 0, 0, 1, 0, 0, Number.POSITIVE_INFINITY, 1]),
      morphImpulses: [
        {
          morphIndex: 0,
          weight: Number.NaN,
          force: [0, Number.POSITIVE_INFINITY, 0]
        }
      ]
    };
    const result = validateMmdPhysicsStepContext(broken);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        "MMD physics step context contains a non-finite number at seconds.",
        "MMD physics step context contains a non-finite number at deltaSeconds.",
        "MMD physics step context contains a non-finite number at rigidBodies[0].shape.size[1].",
        "MMD physics step context contains a non-finite number at inputRotations[6].",
        "MMD physics step context contains a non-finite number at morphImpulses[0].weight.",
        "MMD physics step context contains a non-finite number at morphImpulses[0].force[1]."
      ])
    );
  });

  it("reports invalid skeleton, rigid body, joint, and output references", () => {
    const context = createValidStepContext();
    const bones = context.skeleton?.bones ?? [];
    const rigidBodies = context.rigidBodies ?? [];
    const joints = context.joints ?? [];
    const output = context.output ?? {};
    const firstBone = requireItem(bones[0], "skeleton.bones[0]");
    const secondBone = requireItem(bones[1], "skeleton.bones[1]");
    const firstRigidBody = requireItem(rigidBodies[0], "rigidBodies[0]");
    const secondRigidBody = requireItem(rigidBodies[1], "rigidBodies[1]");
    const firstJoint = requireItem(joints[0], "joints[0]");
    const broken = {
      ...context,
      skeleton: {
        bones: [
          { ...firstBone, parentIndex: 0 },
          { ...secondBone, index: 0 }
        ]
      },
      rigidBodies: [
        { ...firstRigidBody, boneIndex: 2 },
        { ...secondRigidBody, index: 3 }
      ],
      joints: [{ ...firstJoint, rigidBodyIndexB: 2 }],
      output: {
        ...output,
        updatedBoneIndices: [0, 3]
      },
      morphImpulses: [{ morphIndex: -1, weight: 1, rigidBodyIndex: 2 }]
    };
    const result = validateMmdPhysicsStepContext(broken);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "PHYSICS_STEP_CONTEXT_INVALID_REFERENCE",
        "PHYSICS_STEP_CONTEXT_DUPLICATE_INDEX",
        "PHYSICS_STEP_CONTEXT_INVALID_INDEX"
      ])
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        "MMD physics step context bone cannot parent itself at skeleton.bones[0].parentIndex.",
        "MMD physics step context contains a duplicate index at skeleton.bones[1].index: 0.",
        "MMD physics step context contains an invalid reference at rigidBodies[0].boneIndex: 2.",
        "MMD physics step context contains an invalid index at rigidBodies[1].index: 3.",
        "MMD physics step context contains an invalid reference at joints[0].rigidBodyIndexB: 2.",
        "MMD physics step context contains an invalid reference at output.updatedBoneIndices[1]: 3.",
        "MMD physics step context contains an invalid index at morphImpulses[0].morphIndex: -1."
      ])
    );
  });

  it("reports invalid enum values and sparse collection entries from JavaScript callers", () => {
    const context = createValidStepContext();
    const rigidBodies = [...(context.rigidBodies ?? [])] as unknown[];
    const joints = [...(context.joints ?? [])] as unknown[];
    const morphImpulses = [...(context.morphImpulses ?? [])] as unknown[];
    const firstRigidBody = requireItem(rigidBodies[0] as MmdPhysicsStepContext["rigidBodies"][number], "rigidBodies[0]");

    rigidBodies[0] = {
      ...firstRigidBody,
      motionType: "kinematic",
      shape: { type: "mesh", size: [1, 1, 1] }
    };
    rigidBodies[1] = undefined;
    joints[0] = undefined;
    morphImpulses[0] = undefined;

    const result = validateMmdPhysicsStepContext({
      ...context,
      rigidBodies: rigidBodies as MmdPhysicsStepContext["rigidBodies"],
      joints: joints as MmdPhysicsStepContext["joints"],
      morphImpulses: morphImpulses as MmdPhysicsStepContext["morphImpulses"]
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        "MMD physics step context contains an invalid value at rigidBodies[0].motionType: kinematic.",
        "MMD physics step context contains an invalid value at rigidBodies[0].shape.type: mesh.",
        "MMD physics step context contains an invalid value at rigidBodies[1]: undefined.",
        "MMD physics step context contains an invalid value at joints[0]: undefined.",
        "MMD physics step context contains an invalid value at morphImpulses[0]: undefined."
      ])
    );
  });

  it("leaves debug snapshot normalization behavior unchanged", () => {
    expect(() =>
      normalizeMmdPhysicsDebugSnapshot({
        contacts: [
          {
            rigidBodyIndexA: 0,
            rigidBodyIndexB: 1,
            impulse: Number.POSITIVE_INFINITY
          }
        ]
      })
    ).toThrow("contacts[0].impulse");
  });
});
