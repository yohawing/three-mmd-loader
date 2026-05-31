import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

import {
  AmmoMmdPhysicsBackend,
  ThreeMmdLoader,
  createCustomBulletMmdPhysicsBackend
} from "../dist/index.js";

const require = createRequire(import.meta.url);

if (hasFlag("--help") || hasFlag("-h")) {
  printUsage();
  process.exit(0);
}

const defaultModelPath = resolve("..", "data", "unittest", "test_hair_physics.pmx");
const modelPath = resolve(readArg("--model") ?? process.env.MMD_BULLET_LOCAL_MODEL ?? defaultModelPath);
const motionPathArg = readArg("--motion") ?? process.env.MMD_BULLET_LOCAL_MOTION;
const motionPath = motionPathArg ? resolve(motionPathArg) : undefined;
const scriptPath = resolve(readArg("--bullet") ?? "dist/physics/mmd/yw_mmd_bullet.js");
const ammoScriptPath = readArg("--ammo-script") ?? process.env.MMD_BULLET_LOCAL_AMMO_SCRIPT ?? "npm";
const outputJson = hasFlag("--json");
const frameCount = readNumberArg("--frames", 120);
const frameRate = readNumberArg("--frame-rate", 30);
const failPositionDelta = readNumberArg("--fail-position-delta", Number.POSITIVE_INFINITY);
const failSkirtRigidBodyPositionDelta = readNumberArg(
  "--fail-skirt-rigid-body-position-delta",
  Number.POSITIVE_INFINITY
);
const failCustomMaxPosition = readNumberArg("--fail-custom-max-position", Number.POSITIVE_INFINITY);
const ammoFixedTimeStep = readNumberArg("--ammo-fixed-time-step", 1 / 65);
const ammoMaxSubSteps = readNumberArg("--ammo-max-sub-steps", 3);
const customDynamicWithBoneRotationFeedbackScale = readOptionalNumberArg(
  "--dynamic-with-bone-rotation-feedback-scale"
);
const customCollisionMargin = readOptionalNumberArg("--collision-margin");
const customSolverIterations = readOptionalNumberArg("--solver-iterations");
const customSplitImpulse = readOptionalBooleanArg("--split-impulse");
const customSplitImpulsePenetrationThreshold = readOptionalNumberArg(
  "--split-impulse-penetration-threshold"
);

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (!await fileExists(modelPath)) {
    throw new Error(`Local MMD fixture not found: ${modelPath}`);
  }
  if (motionPath && !await fileExists(motionPath)) {
    throw new Error(`Local MMD motion fixture not found: ${motionPath}`);
  }

  const Ammo = ammoScriptPath === "npm" ? await loadNpmAmmo() : await loadScriptAmmo(ammoScriptPath);
  const mmdModule = await loadMmdBullet(scriptPath);
  const ammoBackend = new AmmoMmdPhysicsBackend(Ammo, {
    resetCatchUpSteps: 0,
    solverIterations: 20,
    fixedTimeStep: ammoFixedTimeStep,
    maxSubSteps: ammoMaxSubSteps
  });
  const customBackend = createCustomBulletMmdPhysicsBackend(mmdModule, {
    ...(customDynamicWithBoneRotationFeedbackScale !== undefined
      ? { dynamicWithBoneRotationFeedbackScale: customDynamicWithBoneRotationFeedbackScale }
      : {}),
    ...(customCollisionMargin !== undefined ? { collisionMargin: customCollisionMargin } : {}),
    ...(customSolverIterations !== undefined ? { solverIterations: customSolverIterations } : {}),
    ...(customSplitImpulse !== undefined ? { splitImpulse: customSplitImpulse } : {}),
    ...(customSplitImpulsePenetrationThreshold !== undefined
      ? { splitImpulsePenetrationThreshold: customSplitImpulsePenetrationThreshold }
      : {})
  });

  try {
    const [ammoCase, customCase] = await Promise.all([
      loadRuntimeCase("ammo", ammoBackend),
      loadRuntimeCase("custom", customBackend)
    ]);
    const metrics = compareCases(ammoCase, customCase);
    if (outputJson) {
      printMetricsJson(metrics);
    } else {
      printMetrics(metrics);
    }
    if (metrics.nonFiniteSamples.length > 0) {
      throw new Error(`Non-finite samples were detected: ${metrics.nonFiniteSamples.length}`);
    }
    if (metrics.maxPositionDelta > failPositionDelta) {
      throw new Error(
        `Max Ammo/custom bone position delta ${metrics.maxPositionDelta.toFixed(6)} exceeded ${failPositionDelta}.`
      );
    }
    if (metrics.maxSkirtRigidBodyPositionDelta > failSkirtRigidBodyPositionDelta) {
      throw new Error(
        `Max Ammo/custom skirt rigid-body position delta ${metrics.maxSkirtRigidBodyPositionDelta.toFixed(6)} exceeded ${failSkirtRigidBodyPositionDelta}.`
      );
    }
    if (metrics.customMaxPositionMagnitude > failCustomMaxPosition) {
      throw new Error(
        `Custom max bone position magnitude ${metrics.customMaxPositionMagnitude.toFixed(6)} exceeded ${failCustomMaxPosition}.`
      );
    }
  } finally {
    customBackend.dispose?.();
    ammoBackend.dispose?.();
  }
}

async function loadRuntimeCase(label, physicsBackend) {
  const loader = new ThreeMmdLoader({
    runtime: {
      frameRate,
      physics: "external",
      physicsBackend
    }
  });
  const model = await loader.loadModel(await readFile(modelPath), {
    outlines: false,
    renderOrderProxies: false
  });
  const runtime = model.runtime;
  if (!runtime) {
    throw new Error(`${label}: ThreeMmdLoader did not create a runtime.`);
  }
  const animation = motionPath
    ? (await loader.loadAnimation(await readFile(motionPath))).animation
    : createRestPoseAnimation();
  runtime.setAnimation(animation, model.mesh);
  return {
    label,
    model,
    runtime,
    samples: collectRuntimeSamples(runtime, model.mesh, physicsBackend)
  };
}

function collectRuntimeSamples(runtime, mesh, physicsBackend) {
  const samples = [];
  for (let frame = 0; frame <= frameCount; frame += 1) {
    runtime.tick(frame / frameRate, { mesh });
    const physicsStage = runtime.debugState().stages.physics;
    samples.push({
      frame,
      worldMatricesColumnMajor: Array.from(physicsStage.worldMatricesColumnMajor ?? []),
      rigidBodyWorldMatrices: runtime.debugRigidBodyWorldTransformsColumnMajor?.().map((matrix) => Array.from(matrix)) ?? [],
      contactCount: runtime.physicsBackend?.debugContactCount?.() ?? physicsBackend.debugContactCount?.() ?? null
    });
  }
  return samples;
}

function compareCases(ammoCase, customCase) {
  const boneCount = ammoCase.model.mesh.skeleton.bones.length;
  const metrics = {
    modelPath,
    motionPath: motionPath ?? null,
    ammoBaseline: ammoScriptPath,
    ammoFixedTimeStep,
    ammoMaxSubSteps,
    customDynamicWithBoneRotationFeedbackScale,
    customCollisionMargin,
    customSolverIterations,
    customSplitImpulse,
    customSplitImpulsePenetrationThreshold,
    frameCount,
    frameRate,
    boneCount,
    rigidBodyCount: ammoCase.model.mesh.userData.mmdPhysics?.rigidBodies?.length ?? 0,
    jointCount: ammoCase.model.mesh.userData.mmdPhysics?.joints?.length ?? 0,
    maxPositionDelta: 0,
    worstPositionDelta: null,
    maxRotationDeltaDegrees: 0,
    worstRotationDelta: null,
    maxRigidBodyPositionDelta: 0,
    worstRigidBodyPositionDelta: null,
    maxSkirtRigidBodyPositionDelta: 0,
    worstSkirtRigidBodyPositionDelta: null,
    maxRigidBodyRotationDeltaDegrees: 0,
    worstRigidBodyRotationDelta: null,
    ammoMaxPositionMagnitude: 0,
    customMaxPositionMagnitude: 0,
    customMaxFrameMove: 0,
    worstCustomFrameMove: null,
    customMaxFrameRotationDegrees: 0,
    worstCustomFrameRotation: null,
    customContactFrames: 0,
    customMaxContactCount: 0,
    nonFiniteSamples: []
  };
  let previousCustom = undefined;
  for (let sampleIndex = 0; sampleIndex < ammoCase.samples.length; sampleIndex += 1) {
    const ammoSample = ammoCase.samples[sampleIndex];
    const customSample = customCase.samples[sampleIndex];
    for (let boneIndex = 0; boneIndex < boneCount; boneIndex += 1) {
      const ammoPosition = readMatrixPosition(ammoSample.worldMatricesColumnMajor, boneIndex);
      const customPosition = readMatrixPosition(customSample.worldMatricesColumnMajor, boneIndex);
      const ammoRotation = readMatrixRotation(ammoSample.worldMatricesColumnMajor, boneIndex);
      const customRotation = readMatrixRotation(customSample.worldMatricesColumnMajor, boneIndex);
      recordNonFinite(metrics, "ammo", ammoSample.frame, boneIndex, ammoPosition);
      recordNonFinite(metrics, "custom", customSample.frame, boneIndex, customPosition);

      const ammoMagnitude = vectorMagnitude(ammoPosition);
      const customMagnitude = vectorMagnitude(customPosition);
      if (Number.isFinite(ammoMagnitude)) {
        metrics.ammoMaxPositionMagnitude = Math.max(metrics.ammoMaxPositionMagnitude, ammoMagnitude);
      }
      if (Number.isFinite(customMagnitude)) {
        metrics.customMaxPositionMagnitude = Math.max(metrics.customMaxPositionMagnitude, customMagnitude);
      }

      const delta = positionDelta(ammoPosition, customPosition);
      if (Number.isFinite(delta) && delta > metrics.maxPositionDelta) {
        metrics.maxPositionDelta = delta;
        metrics.worstPositionDelta = {
          frame: ammoSample.frame,
          boneIndex,
          boneName: readableBoneName(ammoCase.model.mesh, boneIndex),
          ammoPosition,
          customPosition,
          delta
        };
      }

      const rotationDeltaDegrees = quaternionAngleDegrees(ammoRotation, customRotation);
      if (Number.isFinite(rotationDeltaDegrees) && rotationDeltaDegrees > metrics.maxRotationDeltaDegrees) {
        metrics.maxRotationDeltaDegrees = rotationDeltaDegrees;
        metrics.worstRotationDelta = {
          frame: ammoSample.frame,
          boneIndex,
          boneName: readableBoneName(ammoCase.model.mesh, boneIndex),
          ammoRotation,
          customRotation,
          delta: rotationDeltaDegrees
        };
      }

      if (previousCustom) {
        const previousPosition = readMatrixPosition(previousCustom.worldMatricesColumnMajor, boneIndex);
        const previousRotation = readMatrixRotation(previousCustom.worldMatricesColumnMajor, boneIndex);
        const frameMove = positionDelta(previousPosition, customPosition);
        if (Number.isFinite(frameMove) && frameMove > metrics.customMaxFrameMove) {
          metrics.customMaxFrameMove = frameMove;
          metrics.worstCustomFrameMove = {
            frame: customSample.frame,
            boneIndex,
            boneName: readableBoneName(customCase.model.mesh, boneIndex),
            previousPosition,
            customPosition,
            delta: frameMove
          };
        }
        const frameRotation = quaternionAngleDegrees(previousRotation, customRotation);
        if (Number.isFinite(frameRotation) && frameRotation > metrics.customMaxFrameRotationDegrees) {
          metrics.customMaxFrameRotationDegrees = frameRotation;
          metrics.worstCustomFrameRotation = {
            frame: customSample.frame,
            boneIndex,
            boneName: readableBoneName(customCase.model.mesh, boneIndex),
            previousRotation,
            customRotation,
            delta: frameRotation
          };
        }
      }
    }
    previousCustom = customSample;
    if (typeof customSample.contactCount === "number") {
      metrics.customMaxContactCount = Math.max(metrics.customMaxContactCount, customSample.contactCount);
      if (customSample.contactCount > 0) {
        metrics.customContactFrames += 1;
      }
    }
    compareRigidBodies(metrics, ammoCase, customCase, ammoSample, customSample);
  }
  return metrics;
}

function compareRigidBodies(metrics, ammoCase, customCase, ammoSample, customSample) {
  const count = Math.min(
    ammoSample.rigidBodyWorldMatrices.length,
    customSample.rigidBodyWorldMatrices.length
  );
  for (let bodyIndex = 0; bodyIndex < count; bodyIndex += 1) {
    const ammoMatrix = ammoSample.rigidBodyWorldMatrices[bodyIndex];
    const customMatrix = customSample.rigidBodyWorldMatrices[bodyIndex];
    const ammoPosition = readMatrixPositionAt(ammoMatrix, 0);
    const customPosition = readMatrixPositionAt(customMatrix, 0);
    const position = positionDelta(ammoPosition, customPosition);
    if (Number.isFinite(position) && position > metrics.maxRigidBodyPositionDelta) {
      metrics.maxRigidBodyPositionDelta = position;
      metrics.worstRigidBodyPositionDelta = {
        frame: ammoSample.frame,
        rigidBodyIndex: bodyIndex,
        rigidBodyName: readableRigidBodyName(ammoCase.model.mesh, bodyIndex),
        ammoPosition,
        customPosition,
        delta: position
      };
    }
    const rigidBodyName = readableRigidBodyName(ammoCase.model.mesh, bodyIndex);
    if (/スカート|skirt/i.test(rigidBodyName) && Number.isFinite(position) && position > metrics.maxSkirtRigidBodyPositionDelta) {
      metrics.maxSkirtRigidBodyPositionDelta = position;
      metrics.worstSkirtRigidBodyPositionDelta = {
        frame: ammoSample.frame,
        rigidBodyIndex: bodyIndex,
        rigidBodyName,
        ammoPosition,
        customPosition,
        delta: position
      };
    }
    const ammoRotation = readMatrixRotationAt(ammoMatrix, 0);
    const customRotation = readMatrixRotationAt(customMatrix, 0);
    const rotation = quaternionAngleDegrees(ammoRotation, customRotation);
    if (Number.isFinite(rotation) && rotation > metrics.maxRigidBodyRotationDeltaDegrees) {
      metrics.maxRigidBodyRotationDeltaDegrees = rotation;
      metrics.worstRigidBodyRotationDelta = {
        frame: ammoSample.frame,
        rigidBodyIndex: bodyIndex,
        rigidBodyName: readableRigidBodyName(customCase.model.mesh, bodyIndex),
        ammoRotation,
        customRotation,
        delta: rotation
      };
    }
  }
}

function printMetrics(metrics) {
  console.log("Ammo.js vs custom Bullet MMD comparison");
  console.log(`fixture=${metrics.modelPath}`);
  console.log(`motion=${metrics.motionPath ?? "(rest pose)"}`);
  console.log(`ammoBaseline=${formatAmmoBaseline(metrics.ammoBaseline)}`);
  console.log(`customBullet=${scriptPath}`);
  console.log(
    `ammoStepping=fixedTimeStep=${metrics.ammoFixedTimeStep} maxSubSteps=${metrics.ammoMaxSubSteps}`
  );
  if (
    metrics.customDynamicWithBoneRotationFeedbackScale !== undefined ||
    metrics.customCollisionMargin !== undefined ||
    metrics.customSolverIterations !== undefined ||
    metrics.customSplitImpulse !== undefined ||
    metrics.customSplitImpulsePenetrationThreshold !== undefined
  ) {
    console.log(
      `Local Bullet MMD custom tuning: dynamicWithBoneRotationFeedbackScale=${metrics.customDynamicWithBoneRotationFeedbackScale ?? "(default)"} ` +
        `collisionMargin=${metrics.customCollisionMargin ?? "(default)"} ` +
        `solverIterations=${metrics.customSolverIterations ?? "(default)"} ` +
        `splitImpulse=${metrics.customSplitImpulse ?? "(default)"} ` +
        `splitImpulsePenetrationThreshold=${metrics.customSplitImpulsePenetrationThreshold ?? "(default)"}`
    );
  }
  console.log(
    `bones=${metrics.boneCount} rigidBodies=${metrics.rigidBodyCount} joints=${metrics.jointCount} frames=0..${metrics.frameCount} @ ${metrics.frameRate}fps`
  );
  console.log(
    `maxPositionDelta=${metrics.maxPositionDelta.toFixed(6)} ` +
      `maxRotationDeltaDeg=${metrics.maxRotationDeltaDegrees.toFixed(3)} ` +
      `maxRigidBodyPositionDelta=${metrics.maxRigidBodyPositionDelta.toFixed(6)} ` +
      `maxRigidBodyRotationDeltaDeg=${metrics.maxRigidBodyRotationDeltaDegrees.toFixed(3)} ` +
      `ammoMaxPosition=${metrics.ammoMaxPositionMagnitude.toFixed(6)} ` +
      `customMaxPosition=${metrics.customMaxPositionMagnitude.toFixed(6)} ` +
      `customMaxFrameMove=${metrics.customMaxFrameMove.toFixed(6)} ` +
      `customMaxFrameRotDeg=${metrics.customMaxFrameRotationDegrees.toFixed(3)} ` +
      `customContactFrames=${metrics.customContactFrames} ` +
      `customMaxContacts=${metrics.customMaxContactCount} ` +
      `nonFinite=${metrics.nonFiniteSamples.length}`
  );
  console.log(`worstPositionDelta=${formatSample(metrics.worstPositionDelta)}`);
  console.log(`worstRotationDelta=${formatRotationSample(metrics.worstRotationDelta)}`);
  console.log(`worstRigidBodyPositionDelta=${formatRigidBodySample(metrics.worstRigidBodyPositionDelta)}`);
  console.log(
    `worstSkirtRigidBodyPositionDelta=${formatRigidBodySample(metrics.worstSkirtRigidBodyPositionDelta)}`
  );
  console.log(`worstRigidBodyRotationDelta=${formatRigidBodyRotationSample(metrics.worstRigidBodyRotationDelta)}`);
  console.log(`worstCustomFrameMove=${formatSample(metrics.worstCustomFrameMove)}`);
  console.log(`worstCustomFrameRotation=${formatRotationSample(metrics.worstCustomFrameRotation)}`);
}

function printMetricsJson(metrics) {
  console.log(JSON.stringify({
    ...metrics,
    ammoBaselineLabel: formatAmmoBaseline(metrics.ammoBaseline),
    customBullet: scriptPath
  }, null, 2));
}

function formatAmmoBaseline(baseline) {
  return baseline === "npm" ? "ammo.js npm package" : baseline;
}

function formatRigidBodySample(sample) {
  if (!sample) {
    return "(none)";
  }
  return [
    `frame=${sample.frame}`,
    `rigidBody=${sample.rigidBodyIndex}:${sample.rigidBodyName}`,
    `delta=${sample.delta.toFixed(6)}`,
    `from=[${formatVector(sample.ammoPosition)}]`,
    `to=[${formatVector(sample.customPosition)}]`
  ].join(" ");
}

function formatRigidBodyRotationSample(sample) {
  if (!sample) {
    return "(none)";
  }
  return [
    `frame=${sample.frame}`,
    `rigidBody=${sample.rigidBodyIndex}:${sample.rigidBodyName}`,
    `deltaDeg=${sample.delta.toFixed(3)}`,
    `from=[${formatVector(sample.ammoRotation)}]`,
    `to=[${formatVector(sample.customRotation)}]`
  ].join(" ");
}

function formatSample(sample) {
  if (!sample) {
    return "(none)";
  }
  return [
    `frame=${sample.frame}`,
    `bone=${sample.boneIndex}:${sample.boneName}`,
    `delta=${sample.delta.toFixed(6)}`,
    `from=[${formatVector(sample.ammoPosition ?? sample.previousPosition)}]`,
    `to=[${formatVector(sample.customPosition)}]`
  ].join(" ");
}

function formatRotationSample(sample) {
  if (!sample) {
    return "(none)";
  }
  return [
    `frame=${sample.frame}`,
    `bone=${sample.boneIndex}:${sample.boneName}`,
    `deltaDeg=${sample.delta.toFixed(3)}`,
    `from=[${formatVector(sample.ammoRotation ?? sample.previousRotation)}]`,
    `to=[${formatVector(sample.customRotation)}]`
  ].join(" ");
}

function formatVector(values) {
  return values.map((value) => value.toFixed(6)).join(", ");
}

function readMatrixPosition(matrices, boneIndex) {
  const base = boneIndex * 16;
  return readMatrixPositionAt(matrices, base);
}

function readMatrixPositionAt(matrices, base) {
  return [
    matrices[base + 12] ?? Number.NaN,
    matrices[base + 13] ?? Number.NaN,
    matrices[base + 14] ?? Number.NaN
  ];
}

function readMatrixRotation(matrices, boneIndex) {
  const base = boneIndex * 16;
  return readMatrixRotationAt(matrices, base);
}

function readMatrixRotationAt(matrices, base) {
  const m00 = matrices[base];
  const m01 = matrices[base + 4];
  const m02 = matrices[base + 8];
  const m10 = matrices[base + 1];
  const m11 = matrices[base + 5];
  const m12 = matrices[base + 9];
  const m20 = matrices[base + 2];
  const m21 = matrices[base + 6];
  const m22 = matrices[base + 10];
  const trace = m00 + m11 + m22;
  let x;
  let y;
  let z;
  let w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  return normalizeQuaternion([x, y, z, w]);
}

function quaternionAngleDegrees(left, right) {
  const dot = Math.abs(left[0] * right[0] + left[1] * right[1] + left[2] * right[2] + left[3] * right[3]);
  return (2 * Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

function normalizeQuaternion(values) {
  const length = Math.hypot(values[0], values[1], values[2], values[3]) || 1;
  return [
    values[0] / length,
    values[1] / length,
    values[2] / length,
    values[3] / length
  ];
}

function readableBoneName(mesh, boneIndex) {
  const bone = mesh.skeleton.bones[boneIndex];
  return typeof bone?.name === "string" && bone.name.length > 0 ? bone.name : "(unnamed)";
}

function readableRigidBodyName(mesh, rigidBodyIndex) {
  const rigidBody = mesh.userData.mmdPhysics?.rigidBodies?.[rigidBodyIndex];
  return typeof rigidBody?.name === "string" && rigidBody.name.length > 0 ? rigidBody.name : "(unnamed)";
}

function recordNonFinite(metrics, backend, frame, boneIndex, position) {
  if (position.every(Number.isFinite)) {
    return;
  }
  metrics.nonFiniteSamples.push({
    backend,
    frame,
    boneIndex,
    position
  });
}

function positionDelta(left, right) {
  return vectorMagnitude([
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2]
  ]);
}

function vectorMagnitude(values) {
  const [x, y, z] = values;
  return Math.hypot(x, y, z);
}

function createRestPoseAnimation() {
  return {
    kind: "vmd",
    metadata: {
      format: "vmd",
      modelName: "",
      counts: { bones: 0, morphs: 0, cameras: 0, lights: 0, selfShadows: 0, properties: 0 },
      maxFrame: 1
    },
    boneTracks: {},
    morphTracks: {},
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
}

async function loadNpmAmmo() {
  const module = await import("ammo.js");
  const candidate = module.default ?? module;
  return typeof candidate === "function" ? await candidate() : candidate;
}

async function loadScriptAmmo(path) {
  const resolved = resolve(path);
  const source = await readFile(resolved, "utf8");
  const sandbox = {
    Ammo: undefined,
    Module: undefined,
    console,
    globalThis: undefined,
    self: undefined,
    window: undefined,
    print: console.log,
    printErr: console.error,
    process,
    require,
    __dirname: dirname(resolved),
    __filename: resolved,
    module: { exports: {} },
    exports: {},
    ArrayBuffer,
    DataView,
    Int8Array,
    Int16Array,
    Int32Array,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    Promise,
    TextDecoder,
    TextEncoder,
    URL,
    WebAssembly
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: resolved });
  const candidate =
    sandbox.module.exports && Object.keys(sandbox.module.exports).length > 0
      ? sandbox.module.exports
      : sandbox.Ammo ?? sandbox.Module;
  if (typeof candidate === "function") {
    return await candidate({
      locateFile(file) {
        return pathToFileURL(join(dirname(resolved), file)).href;
      }
    });
  }
  return candidate;
}

async function loadMmdBullet(path) {
  const scriptSource = await readFile(path, "utf8");
  const moduleRecord = { exports: {} };
  const sandbox = {
    module: moduleRecord,
    exports: moduleRecord.exports,
    require,
    __dirname: dirname(path),
    __filename: path,
    console,
    process,
    WebAssembly
  };
  vm.runInNewContext(scriptSource, sandbox, { filename: path });
  const factory = moduleRecord.exports.default ?? moduleRecord.exports;
  return await factory();
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readNumberArg(name, fallback) {
  const value = readArg(name);
  return value === undefined ? fallback : Number(value);
}

function readOptionalNumberArg(name) {
  const value = readArg(name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOptionalBooleanArg(name) {
  const value = readArg(name);
  if (value === undefined) {
    return undefined;
  }
  return value !== "0" && value !== "false";
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function printUsage() {
  console.log(`Usage:
  npm run compare:bullet:mmd:local -- [options]

Compares the stable ammo.js backend against the custom Bullet MMD backend.
The default Ammo baseline is the npm ammo.js package.

Options:
  --model <path>                     PMX/PMD model path
  --motion <path>                    VMD motion path; defaults to rest pose
  --bullet <path>                    custom Bullet MMD script path
  --ammo-script npm|<path>           Ammo.js baseline; defaults to npm
  --frames <count>                   frame range end; defaults to 120
  --frame-rate <fps>                 runtime frame rate; defaults to 30
  --ammo-fixed-time-step <seconds>   Ammo.js fixed time step; defaults to 1/65
  --ammo-max-sub-steps <count>       Ammo.js max substeps; defaults to 3
  --dynamic-with-bone-rotation-feedback-scale <value>
  --collision-margin <value>
  --solver-iterations <count>
  --split-impulse 0|1|false|true
  --split-impulse-penetration-threshold <value>
  --json                            print metrics as JSON
  --fail-position-delta <value>      fail when max bone position delta exceeds value
  --fail-skirt-rigid-body-position-delta <value>
  --fail-custom-max-position <value>
`);
}
