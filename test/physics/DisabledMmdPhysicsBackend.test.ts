import { describe, expect, it } from "vitest";

import {
  DisabledMmdPhysicsBackend,
  createDisabledMmdPhysicsBackend,
  normalizeMmdPhysicsDebugSnapshot,
  type MmdPhysicsBackend,
  type MmdPhysicsContact,
  type MmdPhysicsDebugSnapshot,
  type MmdPhysicsJoint,
  type MmdPhysicsMorphImpulse,
  type MmdPhysicsOutputBuffers,
  type MmdPhysicsRigidBody,
  type MmdPhysicsRigidBodyTransform,
  type MmdPhysicsSkeleton,
  type MmdPhysicsStepContext
} from "../../src/index.js";
import type { MmdPhysicsBackend as RuntimePhysicsBackend } from "../../src/runtime/index.js";

const stepContext: MmdPhysicsStepContext = {
  seconds: 1,
  deltaSeconds: 1 / 60,
  frame: 30,
  frameRate: 30
};

describe("DisabledMmdPhysicsBackend", () => {
  it("exposes a disabled no-op backend with no diagnostics by default", () => {
    const backend = createDisabledMmdPhysicsBackend();

    expect(backend).toMatchObject({
      name: "disabled",
      disabled: true,
      disposed: false
    });
    expect(backend.step(stepContext)).toEqual({ simulated: false });
    expect(backend.diagnostics?.()).toEqual([]);
  });

  it("reports an optional disabled reason without simulating", () => {
    const backend = new DisabledMmdPhysicsBackend({
      name: "physics-off",
      reason: "Physics is disabled for this runtime."
    });

    expect(backend.step(stepContext)).toEqual({
      simulated: false,
      diagnostics: [
        {
          level: "warning",
          code: "PHYSICS_BACKEND_DISABLED",
          message: "Physics is disabled for this runtime."
        }
      ]
    });
    expect(backend.diagnostics?.()).toEqual([
      {
        level: "warning",
        code: "PHYSICS_BACKEND_DISABLED",
        message: "Physics is disabled for this runtime."
      }
    ]);
  });

  it("keeps reset as a no-op lifecycle boundary and dispose idempotent", () => {
    const backend = createDisabledMmdPhysicsBackend({
      reason: "Physics backend was not configured."
    });

    backend.reset?.({ seconds: 2, frame: 60, frameRate: 30 });
    expect(backend.disposed).toBe(false);
    expect(backend.step({ ...stepContext, seeking: true })).toEqual({
      simulated: false,
      diagnostics: [
        {
          level: "warning",
          code: "PHYSICS_BACKEND_DISABLED",
          message: "Physics backend was not configured."
        }
      ]
    });

    backend.dispose?.();
    backend.dispose?.();
    backend.reset?.({ seconds: 0, frame: 0, frameRate: 30 });

    expect(backend.disposed).toBe(true);
    expect(backend.step(stepContext)).toEqual({
      simulated: false,
      diagnostics: [
        {
          level: "warning",
          code: "PHYSICS_BACKEND_DISABLED",
          message: "Physics backend was not configured."
        },
        {
          level: "warning",
          code: "PHYSICS_BACKEND_DISPOSED",
          message: "Physics backend has been disposed."
        }
      ]
    });
  });

  it("keeps runtime-facing physics backend types type-only compatible", () => {
    const backend: MmdPhysicsBackend = createDisabledMmdPhysicsBackend();
    const runtimeBackend: RuntimePhysicsBackend = backend;

    runtimeBackend.reset?.({ seconds: 0, frame: 0, frameRate: 30 });
    runtimeBackend.dispose?.();

    expect(runtimeBackend.disabled).toBe(true);
    expect(runtimeBackend.disposed).toBe(true);
  });

  it("accepts the extended concrete backend step contract without changing disabled behavior", () => {
    const skeleton: MmdPhysicsSkeleton = {
      bones: [
        {
          index: 0,
          name: "center",
          restTranslation: [0, 10, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    };
    const rigidBodies: readonly MmdPhysicsRigidBody[] = [
      {
        index: 0,
        name: "center-body",
        boneIndex: 0,
        motionType: "dynamicWithBone",
        shape: { type: "sphere", size: [1, 1, 1] },
        collisionGroup: 1,
        collisionMask: 0xffff
      }
    ];
    const joints: readonly MmdPhysicsJoint[] = [
      {
        index: 0,
        name: "center-joint",
        rigidBodyIndexA: 0,
        rigidBodyIndexB: 0,
        linearLimit: { lower: [0, 0, 0], upper: [0, 0, 0] },
        angularLimit: { lower: [-0.1, -0.1, -0.1], upper: [0.1, 0.1, 0.1] }
      }
    ];
    const morphImpulses: readonly MmdPhysicsMorphImpulse[] = [
      {
        morphIndex: 0,
        weight: 0.5,
        rigidBodyIndex: 0,
        force: [0, 1, 0]
      }
    ];
    const transforms: MmdPhysicsRigidBodyTransform[] = [];
    const contacts: MmdPhysicsContact[] = [];
    const output: MmdPhysicsOutputBuffers = {
      translations: new Float32Array([0, 10, 0]),
      rotations: new Float32Array([0, 0, 0, 1]),
      worldMatricesColumnMajor: new Float32Array(16),
      updatedBoneIndices: []
    };
    const context: MmdPhysicsStepContext = {
      ...stepContext,
      skeleton,
      rigidBodies,
      joints,
      inputTranslations: new Float32Array([0, 10, 0]),
      inputRotations: new Float32Array([0, 0, 0, 1]),
      inputWorldMatricesColumnMajor: new Float32Array(16),
      output,
      bonePhysicsToggles: new Uint8Array([1]),
      morphImpulses,
      debug: {
        captureRigidBodyTransforms: true,
        captureContacts: true,
        onRigidBodyTransform: (transform) => transforms.push(transform),
        onContact: (contact) => contacts.push(contact),
        onStepDebug: (snapshot: MmdPhysicsDebugSnapshot) => {
          expect(snapshot.rigidBodyTransforms ?? []).toEqual(transforms);
        }
      }
    };

    const backend = createDisabledMmdPhysicsBackend();

    expect(backend.step(context)).toEqual({ simulated: false });
    expect(transforms).toEqual([]);
    expect(contacts).toEqual([]);
    expect(Array.from(output.translations ?? [])).toEqual([0, 10, 0]);
    expect(output.updatedBoneIndices).toEqual([]);
  });

  it("normalizes debug snapshots into deterministic onStepDebug payloads", () => {
    const snapshot: MmdPhysicsDebugSnapshot = {
      rigidBodyTransforms: [
        {
          rigidBodyIndex: 2,
          translation: [2, 0, 0],
          rotation: [0, 0, 0, 1]
        },
        {
          rigidBodyIndex: 1,
          translation: [1, 0, 0],
          rotation: [0, 0, 0, 1],
          worldMatrixColumnMajor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]
        }
      ],
      contacts: [
        {
          rigidBodyIndexA: 3,
          rigidBodyIndexB: 1,
          distance: 0.25
        },
        {
          rigidBodyIndexA: 1,
          rigidBodyIndexB: 3,
          position: [0, 1, 2],
          normal: [0, 1, 0],
          impulse: 4
        }
      ]
    };

    const normalized = normalizeMmdPhysicsDebugSnapshot(snapshot);

    expect(normalized.diagnostics).toEqual([]);
    expect(normalized.snapshot).toEqual({
      rigidBodyTransforms: [
        {
          rigidBodyIndex: 1,
          translation: [1, 0, 0],
          rotation: [0, 0, 0, 1],
          worldMatrixColumnMajor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]
        },
        {
          rigidBodyIndex: 2,
          translation: [2, 0, 0],
          rotation: [0, 0, 0, 1]
        }
      ],
      contacts: [
        {
          rigidBodyIndexA: 1,
          rigidBodyIndexB: 3,
          position: [0, 1, 2],
          normal: [0, 1, 0],
          impulse: 4
        },
        {
          rigidBodyIndexA: 3,
          rigidBodyIndexB: 1,
          distance: 0.25
        }
      ]
    });
    expect(normalized.snapshot.rigidBodyTransforms).not.toBe(snapshot.rigidBodyTransforms);
    expect(normalized.snapshot.contacts).not.toBe(snapshot.contacts);
  });

  it("normalizes missing debug snapshot arrays to empty arrays", () => {
    expect(normalizeMmdPhysicsDebugSnapshot({})).toEqual({
      snapshot: {
        rigidBodyTransforms: [],
        contacts: []
      },
      diagnostics: []
    });
  });

  it("sorts same-body contact points by position and normal tie breakers", () => {
    const normalized = normalizeMmdPhysicsDebugSnapshot({
      contacts: [
        {
          rigidBodyIndexA: 1,
          rigidBodyIndexB: 2,
          position: [0, 1, 0],
          normal: [0, 0, 1]
        },
        {
          rigidBodyIndexA: 1,
          rigidBodyIndexB: 2,
          position: [0, 0, 0],
          normal: [0, 1, 0]
        },
        {
          rigidBodyIndexA: 1,
          rigidBodyIndexB: 2,
          position: [0, 0, 0],
          normal: [0, 0, 1]
        }
      ]
    });

    expect(normalized.snapshot.contacts).toEqual([
      {
        rigidBodyIndexA: 1,
        rigidBodyIndexB: 2,
        position: [0, 0, 0],
        normal: [0, 0, 1]
      },
      {
        rigidBodyIndexA: 1,
        rigidBodyIndexB: 2,
        position: [0, 0, 0],
        normal: [0, 1, 0]
      },
      {
        rigidBodyIndexA: 1,
        rigidBodyIndexB: 2,
        position: [0, 1, 0],
        normal: [0, 0, 1]
      }
    ]);
  });

  it("throws on non-finite debug snapshot values by default", () => {
    expect(() =>
      normalizeMmdPhysicsDebugSnapshot({
        rigidBodyTransforms: [
          {
            rigidBodyIndex: 0,
            translation: [0, Number.NaN, 0],
            rotation: [0, 0, 0, 1]
          }
        ]
      })
    ).toThrow("rigidBodyTransforms[0].translation[1]");
  });

  it("can report and drop non-finite debug snapshot entries as diagnostics", () => {
    const normalized = normalizeMmdPhysicsDebugSnapshot(
      {
        contacts: [
          {
            rigidBodyIndexA: 0,
            rigidBodyIndexB: 1,
            impulse: Number.POSITIVE_INFINITY
          }
        ]
      },
      { nonFinite: "diagnostic" }
    );

    expect(normalized.snapshot).toEqual({
      rigidBodyTransforms: [],
      contacts: []
    });
    expect(normalized.diagnostics).toEqual([
      {
        level: "error",
        code: "PHYSICS_DEBUG_SNAPSHOT_NON_FINITE",
        message: "Physics debug snapshot contains a non-finite number at contacts[0].impulse."
      }
    ]);
  });
});
