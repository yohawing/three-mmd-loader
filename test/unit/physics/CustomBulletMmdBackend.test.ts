import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createCustomBulletMmdPhysicsBackend,
  customBulletMmdScriptPath,
  resolveCustomBulletMmdScriptUrl,
  type CustomBulletMmdModule
} from "../../../src/physics/index.js";

const bulletSixDofConstraintPath = resolve(
  process.cwd(),
  "native/third_party/bullet3/src/BulletDynamics/ConstraintSolver/btGeneric6DofConstraint.cpp"
);
const bulletSourceIt = existsSync(bulletSixDofConstraintPath) ? it : it.skip;

describe("Custom Bullet MMD backend", () => {
  bulletSourceIt("keeps the MMD 6DoF torque decoupling patch applied", () => {
    const source = readFileSync(bulletSixDofConstraintPath, "utf8");

    expect(source).toContain(
      "btVector3 c = m_calculatedTransformA.getOrigin() - transA.getOrigin();"
    );
    expect(source).not.toContain(
      "btVector3 c = m_calculatedTransformB.getOrigin() - transA.getOrigin();"
    );
  });

  it("cleans broadphase pairs after native kinematic flag changes", () => {
    const source = readFileSync(resolve(process.cwd(), "native/bullet/mmd_bindings.cc"), "utf8");

    expect(source).toContain("cleanProxyFromPairs(proxy, state->dispatcher)");
    expect(source).toContain("state->world->refreshBroadphaseProxy(body)");
    expect(source).toContain(
      "setRigidBodyCollisionFlags(state, binding.body, binding.baseCollisionFlags | CF_KINEMATIC_OBJECT)"
    );
    expect(source).toContain(
      "setRigidBodyCollisionFlags(state, binding.body, binding.baseCollisionFlags)"
    );
  });

  it("preserves Bullet kinematic interpolation when moving animated colliders", () => {
    const source = readFileSync(resolve(process.cwd(), "native/bullet/mmd_bindings.cc"), "utf8");
    const helper = source.slice(
      source.indexOf("void setRigidBodyWorldTransform"),
      source.indexOf("void refreshRigidBodyBroadphasePairs")
    );

    expect(helper).toContain("binding.body->setCenterOfMassTransform(transform)");
    expect(helper).toContain("binding.body->getMotionState()->setWorldTransform(transform)");
    expect(helper).not.toContain("binding.body->setWorldTransform(transform)");
  });

  it("uses Babylon MMD wasm stepping defaults", () => {
    const nativeSource = readFileSync(resolve(process.cwd(), "native/bullet/mmd_bindings.cc"), "utf8");
    const browserSource = readFileSync(resolve(process.cwd(), "src/physics/customBulletMmd.ts"), "utf8");

    expect(nativeSource).toContain("DEFAULT_FIXED_TIME_STEP = btScalar(1.0 / 60.0)");
    expect(nativeSource).toContain("DEFAULT_MAX_SUB_STEPS = 5");
    expect(browserSource).toContain("const DEFAULT_FIXED_TIME_STEP = 1 / 60");
    expect(browserSource).toContain("const DEFAULT_MAX_SUB_STEPS = 5");
  });

  it("resolves the package-local MMD Bullet script URL", () => {
    expect(customBulletMmdScriptPath).toBe("./mmd/yw_mmd_bullet.js");
    expect(resolveCustomBulletMmdScriptUrl("https://example.test/pkg/dist/physics/index.js")).toBe(
      "https://example.test/pkg/dist/physics/mmd/yw_mmd_bullet.js"
    );
  });

  it("compares custom Bullet MMD against npm ammo.js by default", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/compare-bullet-mmd-local-fixture.mjs"),
      "utf8"
    );

    expect(source).toContain('const ammoScriptPath = readArg("--ammo-script") ?? process.env.MMD_BULLET_LOCAL_AMMO_SCRIPT ?? "npm";');
    expect(source).toContain("ammo.js npm package");
    expect(source).toContain("Ammo.js vs custom Bullet MMD comparison");
    expect(source).toContain("await main().catch");
    expect(source).toContain("--ammo-fixed-time-step <seconds>");
    expect(source).toContain("--split-impulse-penetration-threshold <value>");
    expect(source).not.toContain("yw_bullet_ammo");
    expect(source).not.toContain("loadCustomBulletAmmoNamespace");
  });

  it("uses Wasm memory views as direct step buffers", () => {
    const module = createFakeModule();
    const backend = createCustomBulletMmdPhysicsBackend(module);
    const buffers = backend.acquireStepBuffers({
      boneCount: 1,
      translationValueCount: 3,
      rotationValueCount: 4,
      worldMatrixValueCount: 16
    });

    expect(buffers).toBeDefined();
    buffers?.inputTranslations.set([1, 2, 3]);
    buffers?.inputRotations.set([0, 0, 0, 1]);
    buffers?.inputWorldMatricesColumnMajor.set([1, 0, 0, 0], 0);
    buffers?.bonePhysicsToggles.set([1]);

    const result = backend.step({
      seconds: 1,
      deltaSeconds: 1 / 60,
      frame: 60,
      frameRate: 60,
      inputTranslations: buffers?.inputTranslations,
      inputRotations: buffers?.inputRotations,
      inputWorldMatricesColumnMajor: buffers?.inputWorldMatricesColumnMajor,
      output: {
        translations: buffers?.outputTranslations,
        rotations: buffers?.outputRotations,
        worldMatricesColumnMajor: buffers?.outputWorldMatricesColumnMajor,
        updatedBoneIndices: buffers?.updatedBoneIndices
      },
      bonePhysicsToggles: buffers?.bonePhysicsToggles
    });

    expect(result).toEqual({ simulated: true, updatedBoneCount: 1 });
    expect(Array.from(buffers?.outputTranslations ?? [])).toEqual([1, 2, 3]);
    expect(Array.from(buffers?.outputRotations ?? [])).toEqual([0, 0, 0, 1]);
    expect(buffers?.updatedBoneIndices?.[0]).toBe(0);

    backend.dispose?.();
    expect(backend.disposed).toBe(true);
    expect(backend.step({ seconds: 0, deltaSeconds: 0, frame: 0, frameRate: 60 }).simulated).toBe(
      false
    );
  });

  it("copies non-direct step contexts through native buffers", () => {
    const module = createFakeModule();
    const backend = createCustomBulletMmdPhysicsBackend(module);
    const updatedBoneIndices: number[] = [];
    const result = backend.step({
      seconds: 1,
      deltaSeconds: 1 / 60,
      frame: 60,
      frameRate: 60,
      skeleton: {
        bones: [{ index: 0, name: "physics", parentIndex: -1, restTranslation: [1, 2, 3] }]
      },
      inputTranslations: new Float32Array([1, 2, 3]),
      inputRotations: new Float32Array([0, 0, 0, 1]),
      inputWorldMatricesColumnMajor: new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        1, 2, 3, 1
      ]),
      output: {
        translations: [0, 0, 0],
        rotations: [0, 0, 0, 0],
        worldMatricesColumnMajor: new Float32Array(16),
        updatedBoneIndices
      },
      bonePhysicsToggles: [true]
    });

    expect(result).toEqual({ simulated: true, updatedBoneCount: 1 });
    expect(module.nativeInputTranslations()).toEqual([1, 2, 3]);
    expect(module.nativeInputWorldTranslation()).toEqual([1, 2, 3]);
    expect(updatedBoneIndices).toEqual([0]);
    expect(module.nativeBonePhysicsToggles()).toEqual([1]);
  });

  it("uses the shared Wasm memory buffer when unsigned heap views are not exported", () => {
    const module = createFakeModule();
    delete (module as { HEAPU32?: Uint32Array }).HEAPU32;
    const backend = createCustomBulletMmdPhysicsBackend(module);
    const buffers = backend.acquireStepBuffers({
      boneCount: 1,
      translationValueCount: 3,
      rotationValueCount: 4,
      worldMatrixValueCount: 16
    });

    expect(buffers).toBeDefined();
    buffers?.updatedBoneIndices?.set([123]);

    expect(buffers?.updatedBoneIndices?.[0]).toBe(123);
    backend.dispose?.();
  });

  it("falls back to HEAPU8.buffer when HEAPF32 is not exported after a model switch", () => {
    const module = createFakeModule();
    delete (module as { HEAPF32?: Float32Array }).HEAPF32;
    const backend = createCustomBulletMmdPhysicsBackend(module);
    const buffers = backend.acquireStepBuffers({
      boneCount: 1,
      translationValueCount: 3,
      rotationValueCount: 4,
      worldMatrixValueCount: 16
    });

    expect(buffers).toBeDefined();
    buffers?.inputTranslations.set([4, 5, 6]);

    expect(Array.from(buffers?.inputTranslations ?? [])).toEqual([4, 5, 6]);
    backend.dispose?.();
  });

  it("uploads rigid bodies once for a stable step context identity", () => {
    const module = createFakeModule();
    const backend = createCustomBulletMmdPhysicsBackend(module);
    const rigidBodies = [
      {
        index: 0,
        boneIndex: 0,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
        mass: 1
      }
    ] as const;

    backend.step({
      seconds: 0,
      deltaSeconds: 0,
      frame: 0,
      frameRate: 60,
      rigidBodies
    });
    backend.step({
      seconds: 1 / 60,
      deltaSeconds: 1 / 60,
      frame: 1,
      frameRate: 60,
      rigidBodies
    });

    expect(module.uploadCount()).toBe(1);
  });

  it("defaults omitted collision groups to the Ammo backend group zero", () => {
    const module = createFakeModule();
    const backend = createCustomBulletMmdPhysicsBackend(module);
    const rigidBodies = [
      {
        index: 0,
        boneIndex: 0,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
        mass: 1
      }
    ] as const;

    backend.step({
      seconds: 0,
      deltaSeconds: 0,
      frame: 0,
      frameRate: 60,
      rigidBodies
    });

    expect(module.rigidBodyUploads()[0]).toMatchObject({ group: 0, mask: 0xffff });
  });

  it("syncs tuning options and runs reset pose catch-up after reset", () => {
    const module = createFakeModule();
    const backend = createCustomBulletMmdPhysicsBackend(module, {
      fixedTimeStep: 1 / 90,
      maxSubSteps: 7,
      resetCatchUpSteps: 5,
      dynamicWithBoneRotationFeedbackScale: 0.5,
      collisionMargin: 0.02,
      solverIterations: 40,
      splitImpulse: false,
      splitImpulsePenetrationThreshold: -0.02
    });
    const buffers = backend.acquireStepBuffers({
      boneCount: 1,
      translationValueCount: 3,
      rotationValueCount: 4,
      worldMatrixValueCount: 16
    });
    const rigidBodies = [
      {
        index: 0,
        boneIndex: 0,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
        mass: 1
      }
    ] as const;

    backend.reset?.();
    const result = backend.step({
      seconds: 0,
      deltaSeconds: 0,
      frame: 0,
      frameRate: 60,
      rigidBodies,
      inputTranslations: buffers?.inputTranslations,
      inputRotations: buffers?.inputRotations,
      inputWorldMatricesColumnMajor: buffers?.inputWorldMatricesColumnMajor,
      output: {
        translations: buffers?.outputTranslations,
        rotations: buffers?.outputRotations,
        worldMatricesColumnMajor: buffers?.outputWorldMatricesColumnMajor,
        updatedBoneIndices: buffers?.updatedBoneIndices
      },
      bonePhysicsToggles: buffers?.bonePhysicsToggles
    });

    expect(result).toEqual({ simulated: false, updatedBoneCount: 0 });
    expect(module.tuningUploads()[0]).toEqual({
      fixedTimeStep: 1 / 90,
      maxSubSteps: 7,
      resetCatchUpSteps: 5,
      dynamicWithBoneRotationFeedbackScale: 0.5,
      collisionMargin: 0.02,
      solverIterations: 40,
      splitImpulse: 0,
      splitImpulsePenetrationThreshold: -0.02
    });
    expect(module.resetPoseSyncCount()).toBe(1);
    expect(module.resetPoseCatchUpSteps()).toEqual([5]);
  });

  it("uploads joints with rigid bodies", () => {
    const module = createFakeModule();
    const backend = createCustomBulletMmdPhysicsBackend(module);
    const rigidBodies = [
      {
        index: 0,
        boneIndex: 0,
        motionType: "static",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] }
      },
      {
        index: 1,
        boneIndex: 1,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
        mass: 1
      }
    ] as const;
    const joints = [
      {
        index: 0,
        rigidBodyIndexA: 0,
        rigidBodyIndexB: 1,
        translation: [0, 1, 0],
        rotation: [0, 0, 0, 1],
        linearLimit: { lower: [0, 0, 0], upper: [0, 0, 0] },
        angularLimit: { lower: [-0.1, -0.1, -0.1], upper: [0.1, 0.1, 0.1] },
        spring: { linear: [1, 2, 3], angular: [4, 5, 6] }
      }
    ] as const;

    backend.step({
      seconds: 0,
      deltaSeconds: 0,
      frame: 0,
      frameRate: 60,
      rigidBodies,
      joints
    });

    expect(module.jointUploadCount()).toBe(1);
  });

  it("reuploads when the joint identity changes for the same rigid bodies", () => {
    const module = createFakeModule();
    const backend = createCustomBulletMmdPhysicsBackend(module);
    const rigidBodies = [
      {
        index: 0,
        boneIndex: 0,
        motionType: "static",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] }
      },
      {
        index: 1,
        boneIndex: 1,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
        mass: 1
      }
    ] as const;
    const firstJoints = [
      {
        index: 0,
        rigidBodyIndexA: 0,
        rigidBodyIndexB: 1
      }
    ] as const;
    const secondJoints = [
      {
        index: 0,
        rigidBodyIndexA: 1,
        rigidBodyIndexB: 0
      }
    ] as const;

    backend.step({ seconds: 0, deltaSeconds: 0, frame: 0, frameRate: 60, rigidBodies, joints: firstJoints });
    backend.step({ seconds: 0, deltaSeconds: 0, frame: 0, frameRate: 60, rigidBodies, joints: secondJoints });

    expect(module.uploadCount()).toBe(2);
  });
});

function createFakeModule(): CustomBulletMmdModule & {
  uploadCount(): number;
  jointUploadCount(): number;
  rigidBodyUploads(): readonly { readonly group: number; readonly mask: number }[];
  tuningUploads(): readonly {
    readonly fixedTimeStep: number;
    readonly maxSubSteps: number;
    readonly resetCatchUpSteps: number;
    readonly dynamicWithBoneRotationFeedbackScale: number;
    readonly collisionMargin: number;
    readonly solverIterations: number;
    readonly splitImpulse: number;
    readonly splitImpulsePenetrationThreshold: number;
  }[];
  resetPoseSyncCount(): number;
  resetPoseCatchUpSteps(): readonly number[];
  nativeInputTranslations(): readonly number[];
  nativeInputWorldTranslation(): readonly number[];
  nativeBonePhysicsToggles(): readonly number[];
} {
  const memory = new ArrayBuffer(4096);
  const heapF32 = new Float32Array(memory);
  const heapU8 = new Uint8Array(memory);
  const heapU32 = new Uint32Array(memory);
  const pointers = {
    inputTranslations: 0,
    inputRotations: 64,
    inputWorldMatrices: 128,
    outputTranslations: 256,
    outputRotations: 320,
    outputWorldMatrices: 384,
    toggles: 768,
    updated: 832
  };
  let world = 1;
  let nativeModelIdentity = 0;
  let uploadCount = 0;
  let jointUploadCount = 0;
  const rigidBodyUploads: { group: number; mask: number }[] = [];
  const tuningUploads: {
    fixedTimeStep: number;
    maxSubSteps: number;
    resetCatchUpSteps: number;
    dynamicWithBoneRotationFeedbackScale: number;
    collisionMargin: number;
    solverIterations: number;
    splitImpulse: number;
    splitImpulsePenetrationThreshold: number;
  }[] = [];
  const resetPoseCatchUpSteps: number[] = [];
  return {
    HEAPF32: heapF32,
    HEAPU8: heapU8,
    HEAPU32: heapU32,
    _yw_mmd_bullet_create_world: () => world,
    _yw_mmd_bullet_destroy_world: () => {
      world = 0;
    },
    _yw_mmd_bullet_ensure_step_buffers: () => 1,
    _yw_mmd_bullet_begin_model: (_world, _rigidBodyCount, modelIdentity) => {
      uploadCount += 1;
      nativeModelIdentity = modelIdentity;
      return 1;
    },
    _yw_mmd_bullet_add_rigid_body: (
      ...args: Parameters<CustomBulletMmdModule["_yw_mmd_bullet_add_rigid_body"]>
    ) => {
      rigidBodyUploads.push({ group: args[24], mask: args[25] });
      return 1;
    },
    _yw_mmd_bullet_add_joint: () => {
      jointUploadCount += 1;
      return 1;
    },
    _yw_mmd_bullet_commit_model: () => 1,
    _yw_mmd_bullet_model_identity: () => nativeModelIdentity,
    _yw_mmd_bullet_set_tuning: (
      _world,
      fixedTimeStep,
      maxSubSteps,
      resetCatchUpSteps,
      dynamicWithBoneRotationFeedbackScale,
      collisionMargin,
      solverIterations,
      splitImpulse,
      splitImpulsePenetrationThreshold
    ) => {
      tuningUploads.push({
        fixedTimeStep,
        maxSubSteps,
        resetCatchUpSteps,
        dynamicWithBoneRotationFeedbackScale,
        collisionMargin,
        solverIterations,
        splitImpulse,
        splitImpulsePenetrationThreshold
      });
      return 1;
    },
    _yw_mmd_bullet_reset_world: () => undefined,
    _yw_mmd_bullet_reset_pose_sync: (_world, catchUpSteps) => {
      resetPoseCatchUpSteps.push(catchUpSteps);
      return 1;
    },
    _yw_mmd_bullet_step: () => {
      heapF32.set(heapF32.subarray(pointers.inputTranslations / 4, pointers.inputTranslations / 4 + 3), pointers.outputTranslations / 4);
      heapF32.set(heapF32.subarray(pointers.inputRotations / 4, pointers.inputRotations / 4 + 4), pointers.outputRotations / 4);
      heapF32.set(heapF32.subarray(pointers.inputWorldMatrices / 4, pointers.inputWorldMatrices / 4 + 16), pointers.outputWorldMatrices / 4);
      heapU32[pointers.updated / 4] = 0;
      return 1;
    },
    _yw_mmd_bullet_input_translations: () => pointers.inputTranslations,
    _yw_mmd_bullet_input_rotations: () => pointers.inputRotations,
    _yw_mmd_bullet_input_world_matrices: () => pointers.inputWorldMatrices,
    _yw_mmd_bullet_output_translations: () => pointers.outputTranslations,
    _yw_mmd_bullet_output_rotations: () => pointers.outputRotations,
    _yw_mmd_bullet_output_world_matrices: () => pointers.outputWorldMatrices,
    _yw_mmd_bullet_bone_physics_toggles: () => pointers.toggles,
    _yw_mmd_bullet_updated_bone_indices: () => pointers.updated,
    uploadCount: () => uploadCount,
    jointUploadCount: () => jointUploadCount,
    rigidBodyUploads: () => rigidBodyUploads,
    tuningUploads: () => tuningUploads,
    resetPoseSyncCount: () => resetPoseCatchUpSteps.length,
    resetPoseCatchUpSteps: () => resetPoseCatchUpSteps,
    nativeInputTranslations: () => Array.from(heapF32.slice(pointers.inputTranslations / 4, pointers.inputTranslations / 4 + 3)),
    nativeInputWorldTranslation: () => Array.from(heapF32.slice(pointers.inputWorldMatrices / 4 + 12, pointers.inputWorldMatrices / 4 + 15)),
    nativeBonePhysicsToggles: () => Array.from(heapU8.slice(pointers.toggles, pointers.toggles + 1))
  } as CustomBulletMmdModule & {
    uploadCount(): number;
    jointUploadCount(): number;
    rigidBodyUploads(): readonly { readonly group: number; readonly mask: number }[];
    tuningUploads(): readonly {
      readonly fixedTimeStep: number;
      readonly maxSubSteps: number;
      readonly resetCatchUpSteps: number;
      readonly dynamicWithBoneRotationFeedbackScale: number;
      readonly collisionMargin: number;
      readonly solverIterations: number;
      readonly splitImpulse: number;
      readonly splitImpulsePenetrationThreshold: number;
    }[];
    resetPoseSyncCount(): number;
    resetPoseCatchUpSteps(): readonly number[];
    nativeInputTranslations(): readonly number[];
    nativeInputWorldTranslation(): readonly number[];
    nativeBonePhysicsToggles(): readonly number[];
  };
}
