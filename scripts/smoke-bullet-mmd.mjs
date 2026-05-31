import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

import { createCustomBulletMmdPhysicsBackend } from "../dist/physics/index.js";

const scriptPath = resolve(process.argv[2] ?? "dist/physics/mmd/yw_mmd_bullet.js");
const scriptSource = await readFile(scriptPath, "utf8");
const moduleRecord = { exports: {} };
const sandbox = {
  module: moduleRecord,
  exports: moduleRecord.exports,
  require: createRequire(import.meta.url),
  __dirname: dirname(scriptPath),
  __filename: scriptPath,
  console,
  process,
  WebAssembly
};

vm.runInNewContext(scriptSource, sandbox, { filename: scriptPath });
const factory = moduleRecord.exports.default ?? moduleRecord.exports;
const bulletModule = await factory();
const backend = createCustomBulletMmdPhysicsBackend(bulletModule);
const buffers = backend.acquireStepBuffers({
  boneCount: 1,
  translationValueCount: 3,
  rotationValueCount: 4,
  worldMatrixValueCount: 16
});

if (!buffers) {
  throw new Error("Custom Bullet MMD backend did not provide step buffers.");
}

buffers.inputTranslations.set([1, 2, 3]);
buffers.inputRotations.set([0, 0, 0, 1]);
buffers.inputWorldMatricesColumnMajor.set([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  1, 2, 3, 1
]);
buffers.bonePhysicsToggles[0] = 1;

const rigidBodies = [
  {
    index: 0,
    boneIndex: 0,
    motionType: "dynamic",
    shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
    localTranslation: [0, 0, 0],
    localRotation: [0, 0, 0, 1],
    mass: 1,
    linearDamping: 0,
    angularDamping: 0,
    restitution: 0,
    friction: 0.5,
    collisionGroup: 1,
    collisionMask: 0xffff
  }
];

const result = backend.step({
  seconds: 1,
  deltaSeconds: 1 / 60,
  frame: 60,
  frameRate: 60,
  rigidBodies,
  inputTranslations: buffers.inputTranslations,
  inputRotations: buffers.inputRotations,
  inputWorldMatricesColumnMajor: buffers.inputWorldMatricesColumnMajor,
  output: {
    translations: buffers.outputTranslations,
    rotations: buffers.outputRotations,
    worldMatricesColumnMajor: buffers.outputWorldMatricesColumnMajor,
    updatedBoneIndices: buffers.updatedBoneIndices
  },
  bonePhysicsToggles: buffers.bonePhysicsToggles
});

let simulatedResult = result;
if (!result.simulated) {
  simulatedResult = backend.step({
    seconds: 1 + 1 / 60,
    deltaSeconds: 1 / 60,
    frame: 61,
    frameRate: 60,
    rigidBodies,
    inputTranslations: buffers.inputTranslations,
    inputRotations: buffers.inputRotations,
    inputWorldMatricesColumnMajor: buffers.inputWorldMatricesColumnMajor,
    output: {
      translations: buffers.outputTranslations,
      rotations: buffers.outputRotations,
      worldMatricesColumnMajor: buffers.outputWorldMatricesColumnMajor,
      updatedBoneIndices: buffers.updatedBoneIndices
    },
    bonePhysicsToggles: buffers.bonePhysicsToggles
  });
}
if (!simulatedResult.simulated || simulatedResult.updatedBoneCount !== 1) {
  throw new Error(`Unexpected Bullet MMD step result: ${JSON.stringify(simulatedResult)}`);
}
if (buffers.outputTranslations[0] !== 1 || buffers.outputTranslations[1] >= 2 || buffers.outputTranslations[2] !== 3) {
  throw new Error(`Unexpected Bullet MMD output translation: ${Array.from(buffers.outputTranslations).join(",")}`);
}
if (buffers.updatedBoneIndices?.[0] !== 0) {
  throw new Error(`Unexpected Bullet MMD updated bone index: ${buffers.updatedBoneIndices?.[0]}`);
}

const jointBuffers = backend.acquireStepBuffers({
  boneCount: 2,
  translationValueCount: 6,
  rotationValueCount: 8,
  worldMatrixValueCount: 32
});
if (!jointBuffers) {
  throw new Error("Custom Bullet MMD backend did not provide joint step buffers.");
}
jointBuffers.inputTranslations.set([0, 10, 0, 0, 9, 0]);
jointBuffers.inputRotations.set([0, 0, 0, 1, 0, 0, 0, 1]);
jointBuffers.inputWorldMatricesColumnMajor.set([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 10, 0, 1,
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 9, 0, 1
]);
jointBuffers.bonePhysicsToggles.set([1, 1]);
const jointRigidBodies = [
  {
    index: 0,
    boneIndex: 0,
    motionType: "static",
    shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
    localTranslation: [0, 0, 0],
    localRotation: [0, 0, 0, 1],
    collisionGroup: 1,
    collisionMask: 0xffff
  },
  {
    index: 1,
    boneIndex: 1,
    motionType: "dynamic",
    shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
    localTranslation: [0, 0, 0],
    localRotation: [0, 0, 0, 1],
    mass: 1,
    collisionGroup: 1,
    collisionMask: 0xffff
  }
];
const jointDefinitions = [
  {
    index: 0,
    rigidBodyIndexA: 0,
    rigidBodyIndexB: 1,
    translation: [0, 9, 0],
    rotation: [0, 0, 0, 1],
    linearLimit: { lower: [0, 0, 0], upper: [0, 0, 0] },
    angularLimit: { lower: [0, 0, 0], upper: [0, 0, 0] },
    spring: { linear: [0, 0, 0], angular: [0, 0, 0] }
  }
];
const jointResult = backend.step({
  seconds: 1,
  deltaSeconds: 1 / 60,
  frame: 60,
  frameRate: 60,
  rigidBodies: jointRigidBodies,
  joints: jointDefinitions,
  inputTranslations: jointBuffers.inputTranslations,
  inputRotations: jointBuffers.inputRotations,
  inputWorldMatricesColumnMajor: jointBuffers.inputWorldMatricesColumnMajor,
  output: {
    translations: jointBuffers.outputTranslations,
    rotations: jointBuffers.outputRotations,
    worldMatricesColumnMajor: jointBuffers.outputWorldMatricesColumnMajor,
    updatedBoneIndices: jointBuffers.updatedBoneIndices
  },
  bonePhysicsToggles: jointBuffers.bonePhysicsToggles
});
let simulatedJointResult = jointResult;
if (!jointResult.simulated) {
  simulatedJointResult = backend.step({
    seconds: 1 + 1 / 60,
    deltaSeconds: 1 / 60,
    frame: 61,
    frameRate: 60,
    rigidBodies: jointRigidBodies,
    joints: jointDefinitions,
    inputTranslations: jointBuffers.inputTranslations,
    inputRotations: jointBuffers.inputRotations,
    inputWorldMatricesColumnMajor: jointBuffers.inputWorldMatricesColumnMajor,
    output: {
      translations: jointBuffers.outputTranslations,
      rotations: jointBuffers.outputRotations,
      worldMatricesColumnMajor: jointBuffers.outputWorldMatricesColumnMajor,
      updatedBoneIndices: jointBuffers.updatedBoneIndices
    },
    bonePhysicsToggles: jointBuffers.bonePhysicsToggles
  });
}
if (!simulatedJointResult.simulated || simulatedJointResult.updatedBoneCount < 1) {
  throw new Error(`Unexpected Bullet MMD joint step result: ${JSON.stringify(simulatedJointResult)}`);
}

backend.reset?.();
const contactBuffers = backend.acquireStepBuffers({
  boneCount: 2,
  translationValueCount: 6,
  rotationValueCount: 8,
  worldMatrixValueCount: 32
});
if (!contactBuffers) {
  throw new Error("Custom Bullet MMD backend did not provide contact step buffers.");
}
contactBuffers.inputTranslations.set([0, 0, 0, 0, 0.5, 0]);
contactBuffers.inputRotations.set([0, 0, 0, 1, 0, 0, 0, 1]);
contactBuffers.inputWorldMatricesColumnMajor.set([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0.5, 0, 1
]);
contactBuffers.bonePhysicsToggles.set([1, 1]);
const contactRigidBodies = [
  {
    index: 0,
    boneIndex: 0,
    motionType: "static",
    shape: { type: "sphere", size: [1, 1, 1] },
    localTranslation: [0, 0, 0],
    localRotation: [0, 0, 0, 1],
    collisionGroup: 0,
    collisionMask: 0xffff
  },
  {
    index: 1,
    boneIndex: 1,
    motionType: "dynamic",
    shape: { type: "sphere", size: [1, 1, 1] },
    localTranslation: [0, 0.5, 0],
    localRotation: [0, 0, 0, 1],
    mass: 1,
    collisionGroup: 1,
    collisionMask: 0xffff
  }
];
for (let frame = 1; frame <= 2; frame += 1) {
  backend.step({
    seconds: frame / 60,
    deltaSeconds: 1 / 60,
    frame,
    frameRate: 60,
    rigidBodies: contactRigidBodies,
    inputTranslations: contactBuffers.inputTranslations,
    inputRotations: contactBuffers.inputRotations,
    inputWorldMatricesColumnMajor: contactBuffers.inputWorldMatricesColumnMajor,
    output: {
      translations: contactBuffers.outputTranslations,
      rotations: contactBuffers.outputRotations,
      worldMatricesColumnMajor: contactBuffers.outputWorldMatricesColumnMajor,
      updatedBoneIndices: contactBuffers.updatedBoneIndices
    },
    bonePhysicsToggles: contactBuffers.bonePhysicsToggles
  });
}
if (backend.debugContactCount?.() < 1) {
  throw new Error("Custom Bullet MMD contact smoke did not report an overlapping contact.");
}

backend.reset?.();
const resetBuffers = backend.acquireStepBuffers({
  boneCount: 1,
  translationValueCount: 3,
  rotationValueCount: 4,
  worldMatrixValueCount: 16
});
if (!resetBuffers) {
  throw new Error("Custom Bullet MMD backend did not provide reset step buffers.");
}
resetBuffers.inputTranslations.set([0, 4, 0]);
resetBuffers.inputRotations.set([0, 0, 0, 1]);
resetBuffers.inputWorldMatricesColumnMajor.set([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 4, 0, 1
]);
resetBuffers.bonePhysicsToggles[0] = 0;
const disabledResult = backend.step({
  seconds: 2,
  deltaSeconds: 1 / 60,
  frame: 120,
  frameRate: 60,
  rigidBodies,
  inputTranslations: resetBuffers.inputTranslations,
  inputRotations: resetBuffers.inputRotations,
  inputWorldMatricesColumnMajor: resetBuffers.inputWorldMatricesColumnMajor,
  output: {
    translations: resetBuffers.outputTranslations,
    rotations: resetBuffers.outputRotations,
    worldMatricesColumnMajor: resetBuffers.outputWorldMatricesColumnMajor,
    updatedBoneIndices: resetBuffers.updatedBoneIndices
  },
  bonePhysicsToggles: resetBuffers.bonePhysicsToggles
});
let simulatedDisabledResult = disabledResult;
if (!disabledResult.simulated) {
  simulatedDisabledResult = backend.step({
    seconds: 2 + 1 / 60,
    deltaSeconds: 1 / 60,
    frame: 121,
    frameRate: 60,
    rigidBodies,
    inputTranslations: resetBuffers.inputTranslations,
    inputRotations: resetBuffers.inputRotations,
    inputWorldMatricesColumnMajor: resetBuffers.inputWorldMatricesColumnMajor,
    output: {
      translations: resetBuffers.outputTranslations,
      rotations: resetBuffers.outputRotations,
      worldMatricesColumnMajor: resetBuffers.outputWorldMatricesColumnMajor,
      updatedBoneIndices: resetBuffers.updatedBoneIndices
    },
    bonePhysicsToggles: resetBuffers.bonePhysicsToggles
  });
}
if (simulatedDisabledResult.simulated || resetBuffers.outputTranslations[1] !== 4) {
  throw new Error(`Unexpected disabled Bullet MMD step: ${JSON.stringify(disabledResult)} ${Array.from(resetBuffers.outputTranslations).join(",")}`);
}

backend.dispose?.();
console.log("Bullet MMD smoke passed.");
