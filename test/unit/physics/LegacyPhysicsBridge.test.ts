import { describe, expect, it } from "vitest";

import {
  createBonePhysicsToggleBuffer,
  writeBonePhysicsToggleBuffer,
  legacyMmdEulerToQuaternion,
  legacyMmdRigidBodyModeToPhysicsMotionType,
  legacyMmdRigidBodyShapeToPhysicsShapeType,
  mapLegacyMmdJointToPhysicsJoint,
  mapLegacyMmdRigidBodyToPhysicsRigidBody,
  writeQuaternionArrayToBuffer,
  writeTuple3ArrayToBuffer
} from "../../../src/physics/legacyPhysicsBridge.js";
import { validateConcreteMmdPhysicsStepContext } from "../../../src/physics/index.js";

describe("legacy MMD physics bridge helpers", () => {
  it("maps legacy rigid body mode, collision fields, and Euler rotation", () => {
    const rigidBody = mapLegacyMmdRigidBodyToPhysicsRigidBody(
      {
        name: "skirt",
        englishName: "skirt",
        boneIndex: 2,
        group: 4,
        mask: 0x0f0f,
        shape: "capsule",
        size: [0.5, 2, 0.5],
        position: [1, 2, 3],
        rotation: [0, 0, Math.PI / 2],
        mass: 1.25,
        linearDamping: 0.3,
        angularDamping: 0.4,
        restitution: 0.1,
        friction: 0.8,
        mode: "dynamicBone"
      },
      7
    );

    expect(rigidBody).toMatchObject({
      index: 7,
      name: "skirt",
      boneIndex: 2,
      motionType: "dynamicWithBone",
      shape: { type: "capsule", size: [0.5, 2, 0.5] },
      localTranslation: [1, 2, 3],
      mass: 1.25,
      collisionGroup: 4,
      collisionMask: 0x0f0f
    });
    expect(rigidBody.localRotation?.map((value) => Number(value.toFixed(6)))).toEqual([
      0, 0, 0.707107, 0.707107
    ]);
  });

  it("maps unknown rigid body shape and mode to conservative dynamic sphere defaults", () => {
    const rigidBody = mapLegacyMmdRigidBodyToPhysicsRigidBody(
      {
        boneIndex: -1,
        group: 1,
        mask: 0,
        shape: "unknown",
        size: [1, 2, 3],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        mass: 0,
        linearDamping: 0,
        angularDamping: 0,
        restitution: 0,
        friction: 0,
        mode: "unknown"
      },
      0
    );

    expect(rigidBody.motionType).toBe("dynamic");
    expect(rigidBody.shape.type).toBe("sphere");
    expect(rigidBody.collisionMask).toBe(0);
  });

  it("maps every legacy rigid body mode and shape enum value", () => {
    expect(legacyMmdRigidBodyModeToPhysicsMotionType("static")).toBe("static");
    expect(legacyMmdRigidBodyModeToPhysicsMotionType("dynamic")).toBe("dynamic");
    expect(legacyMmdRigidBodyModeToPhysicsMotionType("dynamicBone")).toBe("dynamicWithBone");
    expect(legacyMmdRigidBodyModeToPhysicsMotionType("unknown")).toBe("dynamic");

    expect(legacyMmdRigidBodyShapeToPhysicsShapeType("sphere")).toBe("sphere");
    expect(legacyMmdRigidBodyShapeToPhysicsShapeType("box")).toBe("box");
    expect(legacyMmdRigidBodyShapeToPhysicsShapeType("capsule")).toBe("capsule");
    expect(legacyMmdRigidBodyShapeToPhysicsShapeType("unknown")).toBe("sphere");
  });

  it("maps legacy joint limits, springs, and rotation", () => {
    const joint = mapLegacyMmdJointToPhysicsJoint(
      {
        name: "joint",
        englishName: "joint",
        rigidBodyIndexA: 0,
        rigidBodyIndexB: 1,
        position: [0, 10, 0],
        rotation: [Math.PI, 0, 0],
        translationLowerLimit: [-1, -2, -3],
        translationUpperLimit: [1, 2, 3],
        rotationLowerLimit: [-0.1, -0.2, -0.3],
        rotationUpperLimit: [0.1, 0.2, 0.3],
        springTranslationFactor: [0, 1, 2],
        springRotationFactor: [3, 4, 5]
      },
      3
    );

    expect(joint).toMatchObject({
      index: 3,
      name: "joint",
      rigidBodyIndexA: 0,
      rigidBodyIndexB: 1,
      translation: [0, 10, 0],
      linearLimit: { lower: [-1, -2, -3], upper: [1, 2, 3] },
      angularLimit: { lower: [-0.1, -0.2, -0.3], upper: [0.1, 0.2, 0.3] },
      spring: { linear: [0, 1, 2], angular: [3, 4, 5] }
    });
    expect(joint.rotation?.map((value) => Number(value.toFixed(6)))).toEqual([1, 0, 0, 0]);
  });

  it("uses MMD's YXZ Euler order for multi-axis rigid body rotations", () => {
    expect(
      legacyMmdEulerToQuaternion([Math.PI / 2, Math.PI / 2, 0]).map((value) =>
        Number(value.toFixed(6))
      )
    ).toEqual([0.5, 0.5, -0.5, 0.5]);
  });

  it("writes tuple arrays into flat buffers", () => {
    const translations = new Float32Array(6);
    const rotations = new Float32Array(8);

    writeTuple3ArrayToBuffer(
      [
        [1, 2, 3],
        [4, 5, 6]
      ],
      translations
    );
    writeQuaternionArrayToBuffer(
      [[0, 0, 0, 1], legacyMmdEulerToQuaternion([0, 0, Math.PI / 2])],
      rotations
    );

    expect(Array.from(translations)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(rotations).map((value) => Number(value.toFixed(6)))).toEqual([
      0, 0, 0, 1, 0, 0, 0.707107, 0.707107
    ]);
  });

  it("creates an index-aligned bone physics toggle buffer from Japanese or English names", () => {
    const toggles = createBonePhysicsToggleBuffer(
      [
        { name: "センター", englishName: "center" },
        { name: "髪", englishName: "hair" },
        { name: "腕", englishName: "arm" }
      ],
      {
        center: false,
        髪: 1
      }
    );

    expect(Array.from(toggles)).toEqual([0, 1, 1]);
  });

  it("treats numeric zero and boolean false as disabled bone physics toggles", () => {
    const toggles = createBonePhysicsToggleBuffer(
      [
        { name: "root", englishName: "root" },
        { name: "hair", englishName: "hair" },
        { name: "skirt", englishName: "skirt" },
        { name: "arm", englishName: "arm" }
      ],
      {
        root: 0,
        hair: false,
        skirt: true
      }
    );

    expect(Array.from(toggles)).toEqual([0, 0, 1, 1]);
  });

  it("writes bone physics toggles into a reusable buffer", () => {
    const buffer = new Uint8Array([9, 9, 9]);
    const result = writeBonePhysicsToggleBuffer(
      [
        { name: "root", englishName: "root" },
        { name: "hair", englishName: "hair" }
      ],
      { root: false, hair: true },
      buffer
    );

    expect(result).toBe(buffer);
    expect(Array.from(buffer)).toEqual([0, 1, 9]);
  });

  it("creates bridge output accepted by concrete step context validation", () => {
    const rigidBodies = [
      mapLegacyMmdRigidBodyToPhysicsRigidBody(
        {
          name: "center body",
          boneIndex: 0,
          group: 1,
          mask: 0xffff,
          shape: "sphere",
          size: [1, 1, 1],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          mass: 0,
          linearDamping: 0,
          angularDamping: 0,
          restitution: 0,
          friction: 0.5,
          mode: "static"
        },
        0
      ),
      mapLegacyMmdRigidBodyToPhysicsRigidBody(
        {
          name: "skirt body",
          boneIndex: 1,
          group: 2,
          mask: 0x0001,
          shape: "capsule",
          size: [0.25, 1.5, 0.25],
          position: [0, -1, 0],
          rotation: [0, 0, Math.PI / 4],
          mass: 0.8,
          linearDamping: 0.2,
          angularDamping: 0.3,
          restitution: 0.1,
          friction: 0.7,
          mode: "dynamicBone"
        },
        1
      )
    ];
    const joints = [
      mapLegacyMmdJointToPhysicsJoint(
        {
          name: "skirt joint",
          rigidBodyIndexA: 0,
          rigidBodyIndexB: 1,
          position: [0, -0.5, 0],
          rotation: [0, 0, 0],
          translationLowerLimit: [-0.1, -0.1, -0.1],
          translationUpperLimit: [0.1, 0.1, 0.1],
          rotationLowerLimit: [-0.2, -0.2, -0.2],
          rotationUpperLimit: [0.2, 0.2, 0.2],
          springTranslationFactor: [0, 0, 0],
          springRotationFactor: [0.5, 0.5, 0.5]
        },
        0
      )
    ];
    const inputTranslations = new Float32Array(6);
    const inputRotations = new Float32Array(8);
    writeTuple3ArrayToBuffer(
      [
        [0, 0, 0],
        [0, -1, 0]
      ],
      inputTranslations
    );
    writeQuaternionArrayToBuffer(
      [[0, 0, 0, 1], legacyMmdEulerToQuaternion([0, 0, Math.PI / 4])],
      inputRotations
    );

    const result = validateConcreteMmdPhysicsStepContext({
      seconds: 0,
      deltaSeconds: 1 / 60,
      frame: 0,
      frameRate: 60,
      skeleton: {
        bones: [
          { index: 0, name: "センター", parentIndex: -1, restTranslation: [0, 0, 0] },
          { index: 1, name: "スカート", parentIndex: 0, restTranslation: [0, -1, 0] }
        ]
      },
      rigidBodies,
      joints,
      inputTranslations,
      inputRotations,
      inputWorldMatricesColumnMajor: new Float32Array(32),
      output: {
        translations: new Float32Array(6),
        rotations: new Float32Array(8),
        worldMatricesColumnMajor: new Float32Array(32),
        updatedBoneIndices: [0, 1]
      },
      bonePhysicsToggles: createBonePhysicsToggleBuffer(
        [
          { name: "センター", englishName: "center" },
          { name: "スカート", englishName: "skirt" }
        ],
        { center: false, skirt: true }
      )
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.summary).toMatchObject({
      boneCount: 2,
      rigidBodyCount: 2,
      jointCount: 1,
      hasBonePhysicsToggles: true,
      hasOutputWorldMatricesColumnMajor: true
    });
  });
});
