import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

import { createCustomBulletMmdPhysicsBackend } from "../dist/physics/index.js";

const scriptPath = resolve(process.argv[2] ?? "dist/physics/mmd/mmd_bullet.js");
const workerScriptPath = resolve(process.argv[3] ?? resolve(dirname(scriptPath), "mmd_bullet.worker.mjs"));
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
const bulletModule = await factory({ locateFile: (path) => resolve(dirname(scriptPath), path) });

const requiredExports = [
  "_mmd_anim_bullet_get_version",
  "_mmd_anim_bullet_get_last_error",
  "_mmd_anim_bullet_world_create",
  "_mmd_anim_bullet_world_destroy",
  "_mmd_anim_bullet_world_reset",
  "_mmd_anim_bullet_world_settle_to_current",
  "_mmd_anim_bullet_world_step",
  "_mmd_anim_bullet_world_add_rigidbody",
  "_mmd_anim_bullet_world_get_rigidbody_count",
  "_mmd_anim_bullet_world_get_rigidbody_transform",
  "_mmd_anim_bullet_world_set_rigidbody_transform",
  "_mmd_anim_bullet_world_add_6dof_spring_joint",
  "_mmd_anim_bullet_world_get_constraint_count",
  "_mmd_anim_bullet_world_collect_contacts",
  "_mmd_anim_bullet_world_get_gravity",
  "_mmd_anim_bullet_world_set_gravity"
];
await verifyRawAbi(bulletModule, "classic");

const workerRecord = await import(pathToFileURL(workerScriptPath).href);
const workerFactory = workerRecord.default ?? workerRecord.MmdBullet;
if (typeof workerFactory !== "function") {
  throw new Error(`Module-worker Bullet factory is missing from ${workerScriptPath}.`);
}
const workerBulletModule = await workerFactory({
  locateFile: (path) => resolve(dirname(workerScriptPath), path)
});
await verifyRawAbi(workerBulletModule, "module-worker");

const backend = createCustomBulletMmdPhysicsBackend(bulletModule);

const inputWorldMatricesColumnMajor = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 10, 0, 1
]);
const outputTranslations = new Float32Array([0, 10, 0]);
const outputRotations = new Float32Array([0, 0, 0, 1]);
const outputWorldMatricesColumnMajor = new Float32Array(inputWorldMatricesColumnMajor);
const outputUpdatedBoneIndices = new Uint32Array(1);
const context = {
  seconds: 0,
  deltaSeconds: 1 / 60,
  frame: 0,
  frameRate: 60,
  skeleton: { bones: [{ index: 0, parentIndex: -1, restTranslation: [0, 10, 0] }] },
  rigidBodies: [{
    index: 0,
    boneIndex: 0,
    motionType: "dynamic",
    shape: { type: "sphere", size: [0.5, 0.5, 0.5] },
    localTranslation: [0, 10, 0],
    localRotation: [0, 0, 0, 1],
    mass: 1,
    friction: 0.5,
    collisionMask: 0xffff
  }],
  inputWorldMatricesColumnMajor,
  output: {
    translations: outputTranslations,
    rotations: outputRotations,
    worldMatricesColumnMajor: outputWorldMatricesColumnMajor,
    updatedBoneIndices: outputUpdatedBoneIndices
  },
  bonePhysicsToggles: new Uint8Array([1])
};

const result = backend.step(context);
if (result.simulated || result.updatedBoneCount !== 1) {
  throw new Error(`Unexpected initial seed-only mmd-anim Bullet result: ${JSON.stringify(result)}`);
}
if (!Number.isFinite(outputTranslations[1])) {
  throw new Error(`Expected finite mmd-anim Bullet output translation: ${Array.from(outputTranslations).join(",")}`);
}
if (outputUpdatedBoneIndices[0] !== 0) {
  throw new Error(`Unexpected updated bone index: ${outputUpdatedBoneIndices[0]}`);
}

const stepped = backend.step({ ...context, seconds: 1 / 60, frame: 1 });
if (!stepped.simulated || stepped.updatedBoneCount !== 1) {
  throw new Error(`Unexpected first forward mmd-anim Bullet step result: ${JSON.stringify(stepped)}`);
}

backend.reset?.();
inputWorldMatricesColumnMajor[13] = 20;
outputTranslations.fill(0);
outputRotations.fill(0);
outputRotations[3] = 1;
const reseeded = backend.step({ ...context, seconds: 1 / 30, frame: 2, seeking: true });
if (reseeded.simulated || reseeded.updatedBoneCount !== 1) {
  throw new Error(`Unexpected seed-only mmd-anim Bullet result: ${JSON.stringify(reseeded)}`);
}
if (Math.abs((outputTranslations[1] ?? 0) - 20) > 1.0e-4) {
  throw new Error(`Expected reset/seek to preserve the seeded pose: ${Array.from(outputTranslations).join(",")}`);
}

backend.dispose?.();
if (!backend.disposed) {
  throw new Error("mmd-anim Bullet backend did not dispose");
}
console.log("mmd-anim Bullet smoke passed.");

async function verifyRawAbi(module, label) {
  for (const name of requiredExports) {
    if (typeof module[name] !== "function") throw new Error(`${label} Bullet module export is missing: ${name}`);
  }
  if (module._mmd_anim_bullet_get_version() !== 1) {
    throw new Error(`Unexpected ${label} mmd-anim Bullet ABI version: ${module._mmd_anim_bullet_get_version()}`);
  }

  const rawWorldPointer = module._malloc(4);
  const rawGravityPointer = module._malloc(12);
  let rawWorld = 0;
  try {
    if (module._mmd_anim_bullet_world_create(rawWorldPointer) !== 0) {
      throw new Error(`${label} mmd-anim Bullet ABI world creation failed.`);
    }
    module.refreshMemoryViews?.();
    rawWorld = module.HEAPU32?.[rawWorldPointer >>> 2] ?? 0;
    if (rawWorld === 0 || module._mmd_anim_bullet_world_get_gravity(rawWorld, rawGravityPointer) !== 0) {
      throw new Error(`${label} mmd-anim Bullet ABI gravity read failed.`);
    }
    if (module._mmd_anim_bullet_world_set_gravity(rawWorld, rawGravityPointer) !== 0) {
      throw new Error(`${label} mmd-anim Bullet ABI gravity write failed.`);
    }
  } finally {
    if (rawWorld !== 0) module._mmd_anim_bullet_world_destroy(rawWorld);
    module._free(rawWorldPointer);
    module._free(rawGravityPointer);
  }
}
