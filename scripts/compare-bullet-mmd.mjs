import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

import {
  AmmoMmdPhysicsBackend,
  createCustomBulletMmdPhysicsBackend
} from "../dist/physics/index.js";

const require = createRequire(import.meta.url);

async function loadNpmAmmo() {
  const module = await import("ammo.js");
  const candidate = module.default ?? module;
  return typeof candidate === "function" ? await candidate() : candidate;
}

async function loadMmdBullet(scriptPath) {
  const resolved = resolve(scriptPath);
  const scriptSource = await readFile(resolved, "utf8");
  const moduleRecord = { exports: {} };
  const sandbox = {
    module: moduleRecord,
    exports: moduleRecord.exports,
    require,
    __dirname: dirname(resolved),
    __filename: resolved,
    console,
    process,
    WebAssembly
  };
  vm.runInNewContext(scriptSource, sandbox, { filename: resolved });
  const factory = moduleRecord.exports.default ?? moduleRecord.exports;
  return await factory();
}

function createSingleBodyContext() {
  const inputTranslations = new Float32Array([0, 10, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 10, 0, 1
  ]);
  return {
    seconds: 0,
    deltaSeconds: 0,
    frame: 0,
    frameRate: 60,
    skeleton: { bones: [{ index: 0, parentIndex: -1, restTranslation: [0, 10, 0] }] },
    rigidBodies: [
      {
        index: 0,
        boneIndex: 0,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
        localTranslation: [0, 10, 0],
        localRotation: [0, 0, 0, 1],
        mass: 1,
        linearDamping: 0,
        angularDamping: 0,
        restitution: 0,
        friction: 0.5,
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
    },
    bonePhysicsToggles: new Uint8Array([1])
  };
}

function createJointContext() {
  const inputTranslations = new Float32Array([0, 10, 0, 0, 9, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 10, 0, 1,
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 9, 0, 1
  ]);
  return {
    seconds: 0,
    deltaSeconds: 0,
    frame: 0,
    frameRate: 60,
    skeleton: {
      bones: [
        { index: 0, parentIndex: -1, restTranslation: [0, 10, 0] },
        { index: 1, parentIndex: -1, restTranslation: [0, 9, 0] }
      ]
    },
    rigidBodies: [
      {
        index: 0,
        boneIndex: 0,
        motionType: "static",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
        localTranslation: [0, 10, 0],
        localRotation: [0, 0, 0, 1],
        collisionGroup: 1,
        collisionMask: 0xffff
      },
      {
        index: 1,
        boneIndex: 1,
        motionType: "dynamic",
        shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
        localTranslation: [0, 9, 0],
        localRotation: [0, 0, 0, 1],
        mass: 1,
        linearDamping: 0,
        angularDamping: 0,
        restitution: 0,
        friction: 0.5,
        collisionGroup: 1,
        collisionMask: 0xffff
      }
    ],
    joints: [
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
    ],
    inputTranslations,
    inputRotations,
    inputWorldMatricesColumnMajor,
    output: {
      translations: new Float32Array(inputTranslations),
      rotations: new Float32Array(inputRotations),
      worldMatricesColumnMajor: new Float32Array(inputWorldMatricesColumnMajor),
      updatedBoneIndices: []
    },
    bonePhysicsToggles: new Uint8Array([1, 1])
  };
}

function syncInputFromOutput(context) {
  context.inputTranslations.set(context.output.translations);
  context.inputRotations.set(context.output.rotations);
  context.inputWorldMatricesColumnMajor.set(context.output.worldMatricesColumnMajor);
  if (Array.isArray(context.output.updatedBoneIndices)) {
    context.output.updatedBoneIndices.length = 0;
  }
}

function composeTranslationMatrix(target, boneIndex, x, y, z) {
  const base = boneIndex * 16;
  target.set([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ], base);
}

function stepContext(backend, context, steps) {
  backend.step(context);
  for (let step = 1; step <= steps; step += 1) {
    context.seconds = step / 60;
    context.deltaSeconds = 1 / 60;
    context.frame = step;
    const result = backend.step(context);
    if (result.diagnostics?.some((diagnostic) => diagnostic.level === "error")) {
      throw new Error(`Backend failed: ${JSON.stringify(result.diagnostics)}`);
    }
    syncInputFromOutput(context);
    for (let boneIndex = 0; boneIndex < context.skeleton.bones.length; boneIndex += 1) {
      const offset = boneIndex * 3;
      composeTranslationMatrix(
        context.inputWorldMatricesColumnMajor,
        boneIndex,
        context.inputTranslations[offset],
        context.inputTranslations[offset + 1],
        context.inputTranslations[offset + 2]
      );
      composeTranslationMatrix(
        context.output.worldMatricesColumnMajor,
        boneIndex,
        context.inputTranslations[offset],
        context.inputTranslations[offset + 1],
        context.inputTranslations[offset + 2]
      );
    }
  }
}

function compareCase(label, ammoBackend, mmdBackend, createContext, boneIndex, tolerance) {
  const ammoContext = createContext();
  const sourceContext = createContext();
  const mmdContext = createContext();
  const mmdBuffers = mmdBackend.acquireStepBuffers({
    boneCount: mmdContext.skeleton.bones.length,
    translationValueCount: mmdContext.skeleton.bones.length * 3,
    rotationValueCount: mmdContext.skeleton.bones.length * 4,
    worldMatrixValueCount: mmdContext.skeleton.bones.length * 16
  });
  if (!mmdBuffers) {
    throw new Error("Custom Bullet MMD backend did not provide step buffers.");
  }
  mmdContext.inputTranslations = mmdBuffers.inputTranslations;
  mmdContext.inputRotations = mmdBuffers.inputRotations;
  mmdContext.inputWorldMatricesColumnMajor = mmdBuffers.inputWorldMatricesColumnMajor;
  mmdContext.output = {
    translations: mmdBuffers.outputTranslations,
    rotations: mmdBuffers.outputRotations,
    worldMatricesColumnMajor: mmdBuffers.outputWorldMatricesColumnMajor,
    updatedBoneIndices: mmdBuffers.updatedBoneIndices
  };
  mmdContext.bonePhysicsToggles = mmdBuffers.bonePhysicsToggles;
  mmdContext.inputTranslations.set(sourceContext.inputTranslations);
  mmdContext.inputRotations.set(sourceContext.inputRotations);
  mmdContext.inputWorldMatricesColumnMajor.set(sourceContext.inputWorldMatricesColumnMajor);
  mmdContext.output.translations.set(sourceContext.output.translations);
  mmdContext.output.rotations.set(sourceContext.output.rotations);
  mmdContext.output.worldMatricesColumnMajor.set(sourceContext.output.worldMatricesColumnMajor);
  mmdContext.bonePhysicsToggles.set(sourceContext.bonePhysicsToggles);

  stepContext(ammoBackend, ammoContext, 30);
  stepContext(mmdBackend, mmdContext, 30);

  const ammoY = ammoContext.output.translations[boneIndex * 3 + 1];
  const mmdY = mmdContext.output.translations[boneIndex * 3 + 1];
  const delta = Math.abs(ammoY - mmdY);
  console.log(`${label}: ammoY=${ammoY.toFixed(6)} mmdY=${mmdY.toFixed(6)} delta=${delta.toExponential(3)}`);
  if (!Number.isFinite(ammoY) || !Number.isFinite(mmdY) || delta > tolerance) {
    throw new Error(`${label} diverged beyond tolerance.`);
  }
}

const scriptPath = process.argv[2] ?? "dist/physics/mmd/mmd_bullet.js";
const Ammo = await loadNpmAmmo();
const mmdModule = await loadMmdBullet(scriptPath);
const ammoBackend = new AmmoMmdPhysicsBackend(Ammo, {
  gravity: [0, -98, 0],
  fixedTimeStep: 1 / 60,
  maxSubSteps: 0,
  disableAdditionalDampingPatch: true
});
const mmdBackend = createCustomBulletMmdPhysicsBackend(mmdModule);

compareCase("single dynamic body", ammoBackend, mmdBackend, createSingleBodyContext, 0, 0.35);
compareCase("joint anchored body", ammoBackend, mmdBackend, createJointContext, 1, 0.75);
mmdBackend.dispose?.();
ammoBackend.dispose?.();
console.log("Bullet MMD comparison passed.");
