#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DefaultMmdRuntime } from "../dist/runtime/index.js";
import { ThreeMmdLoader } from "../dist/three/index.js";

const projectRoot = resolve(import.meta.dirname, "..");

const args = parseArgs(process.argv.slice(2));
const modelPath = resolve(projectRoot, args.model);
const motionPath = resolve(projectRoot, args.motion);
const frames = args.frames;
const frameRate = args.frameRate;
const compareTarget = args.compareTarget;
const compareTargets = compareTarget === "all"
  ? ["matrices", "sampling", "append", "ik", "morph", "camera", "light"]
  : [compareTarget];
const comparePhysicsHandoff = compareTarget === "physics-handoff";

const [modelBytes, motionBytes] = await Promise.all([
  readFile(modelPath),
  readFile(motionPath)
]);

const mmdAnimPhysicsBackend = comparePhysicsHandoff ? createRecordingPhysicsBackend() : undefined;
const jsPhysicsBackend = comparePhysicsHandoff ? createRecordingPhysicsBackend() : undefined;
const mmdAnimCase = await loadCase("mmd-anim", new ThreeMmdLoader({
  runtime: {
    frameRate,
    physics: comparePhysicsHandoff ? "external" : "none",
    physicsBackend: mmdAnimPhysicsBackend
  }
}), mmdAnimPhysicsBackend);
const jsCase = await loadCase("js", new ThreeMmdLoader({
  runtimeFactory: () => new DefaultMmdRuntime({
    frameRate,
    physics: comparePhysicsHandoff ? "external" : "none",
    physicsBackend: jsPhysicsBackend
  })
}), jsPhysicsBackend);

const summary = {
  model: args.model,
  motion: args.motion,
  frameRate,
  compareTarget,
  frames: [],
  maxAbsError: 0,
  rmsError: 0,
  comparedValues: 0,
  finite: true
};

let squaredErrorSum = 0;

for (const frame of frames) {
  const seconds = frame / frameRate;
  const mmdAnimState = evaluateCase(mmdAnimCase, seconds);
  const jsState = evaluateCase(jsCase, seconds);
  const targetMetrics = {};
  let frameMaxAbsError = 0;
  let frameSquaredErrorSum = 0;
  let frameComparedValues = 0;
  let frameFinite = true;
  for (const target of compareTargets) {
    const metrics = compareTargetState(target, mmdAnimState, jsState, compareTarget !== "all");
    targetMetrics[target] = frameMetrics(metrics);
    frameMaxAbsError = Math.max(frameMaxAbsError, metrics.maxAbsError);
    frameSquaredErrorSum += metrics.squaredErrorSum;
    frameComparedValues += metrics.comparedValues;
    frameFinite &&= metrics.finite;
  }
  summary.frames.push({
    frame,
    seconds,
    maxAbsError: frameMaxAbsError,
    rmsError: frameComparedValues === 0 ? 0 : Math.sqrt(frameSquaredErrorSum / frameComparedValues),
    comparedValues: frameComparedValues,
    finite: frameFinite,
    targets: targetMetrics
  });
  summary.maxAbsError = Math.max(summary.maxAbsError, frameMaxAbsError);
  summary.comparedValues += frameComparedValues;
  squaredErrorSum += frameSquaredErrorSum;
  summary.finite &&= frameFinite;
}

summary.rmsError = summary.comparedValues === 0
  ? 0
  : Math.sqrt(squaredErrorSum / summary.comparedValues);

console.log(JSON.stringify({
  runtimes: {
    candidate: mmdAnimCase.runtime.constructor.name,
    baseline: jsCase.runtime.constructor.name
  },
  ...summary
}, null, 2));

if (!summary.finite || summary.maxAbsError > args.maxError) {
  process.exitCode = 1;
}

async function loadCase(label, loader, physicsBackend) {
  const model = await loader.loadModel(modelBytes);
  const animation = await loader.loadAnimation(motionBytes);
  model.runtime.setAnimation(animation.animation, model.mesh);
  return { label, model, runtime: model.runtime, physicsBackend };
}

function evaluateCase(testCase, seconds) {
  if (comparePhysicsHandoff) {
    testCase.runtime.evaluate(seconds);
  } else {
    testCase.runtime.evaluate(seconds, { physics: false });
  }
  const debugState = testCase.runtime.debugState();
  return {
    matrices: debugState.stages.physics.worldMatricesColumnMajor,
    sampling: debugState.stages.vmdInterpolation.worldMatricesColumnMajor,
    morph: debugState.stages.vmdInterpolation.morphWeights,
    append: debugState.stages.appendTransform.worldMatricesColumnMajor,
    ik: debugState.stages.ik.worldMatricesColumnMajor,
    physicsHandoff: testCase.physicsBackend?.readSnapshotNumbers(),
    camera: flattenCameraState(testCase.runtime.cameraState()),
    light: flattenLightState(testCase.runtime.lightState())
  };
}

function compareTargetState(target, candidateState, baselineState, required) {
  if (target === "matrices") {
    return compareValues(target, candidateState.matrices, baselineState.matrices, required);
  }
  if (target === "sampling") {
    return compareValues(target, candidateState.sampling, baselineState.sampling, required);
  }
  if (target === "append") {
    return compareValues(target, candidateState.append, baselineState.append, required);
  }
  if (target === "ik") {
    return compareValues(target, candidateState.ik, baselineState.ik, required);
  }
  if (target === "morph") {
    return compareValues(target, candidateState.morph, baselineState.morph, required);
  }
  if (target === "camera") {
    return compareValues(target, candidateState.camera, baselineState.camera, required);
  }
  if (target === "light") {
    return compareValues(target, candidateState.light, baselineState.light, required);
  }
  if (target === "physics-handoff") {
    return compareValues(target, candidateState.physicsHandoff, baselineState.physicsHandoff, required);
  }
  throw new Error(`Unsupported compare target: ${target}`);
}

function compareValues(label, candidate, baseline, required) {
  if (candidate === undefined || baseline === undefined) {
    if (candidate === baseline && !required) {
      return {
        maxAbsError: 0,
        squaredErrorSum: 0,
        rmsError: 0,
        comparedValues: 0,
        finite: true,
        available: false
      };
    }
    throw new Error(`${label} state unavailable: candidate=${candidate !== undefined}, baseline=${baseline !== undefined}`);
  }
  if (candidate.length !== baseline.length) {
    throw new Error(`${label} length mismatch: candidate=${candidate.length}, baseline=${baseline.length}`);
  }
  let maxAbsError = 0;
  let squaredErrorSum = 0;
  let finite = true;
  for (let index = 0; index < baseline.length; index += 1) {
    const left = candidate[index] ?? Number.NaN;
    const right = baseline[index] ?? Number.NaN;
    finite &&= Number.isFinite(left) && Number.isFinite(right);
    const error = Math.abs(left - right);
    maxAbsError = Math.max(maxAbsError, error);
    squaredErrorSum += error * error;
  }
  return {
    maxAbsError,
    squaredErrorSum,
    rmsError: baseline.length === 0 ? 0 : Math.sqrt(squaredErrorSum / baseline.length),
    comparedValues: baseline.length,
    finite,
    available: true
  };
}

function frameMetrics(metrics) {
  return {
    maxAbsError: metrics.maxAbsError,
    rmsError: metrics.rmsError,
    comparedValues: metrics.comparedValues,
    finite: metrics.finite,
    available: metrics.available
  };
}

function flattenCameraState(state) {
  if (state === undefined) {
    return undefined;
  }
  return [
    state.distance,
    state.position[0],
    state.position[1],
    state.position[2],
    state.rotation[0],
    state.rotation[1],
    state.rotation[2],
    state.fov,
    state.perspective ? 1 : 0
  ];
}

function flattenLightState(state) {
  if (state === undefined) {
    return undefined;
  }
  return [
    state.color[0],
    state.color[1],
    state.color[2],
    state.direction[0],
    state.direction[1],
    state.direction[2]
  ];
}

function createRecordingPhysicsBackend() {
  let snapshotNumbers;
  return {
    name: "recording-physics",
    disabled: false,
    disposed: false,
    step(context) {
      snapshotNumbers = flattenPhysicsContext(context);
      return { simulated: false };
    },
    readSnapshotNumbers() {
      return snapshotNumbers;
    }
  };
}

function flattenPhysicsContext(context) {
  const values = [
    context.seconds,
    context.deltaSeconds,
    context.frame,
    context.frameRate,
    context.seeking ? 1 : 0
  ];
  for (const bone of context.skeleton?.bones ?? []) {
    values.push(
      bone.index,
      bone.parentIndex ?? -1,
      bone.transformAfterPhysics ? 1 : 0
    );
    pushNumbers(values, bone.restTranslation);
    pushNumbers(values, bone.restRotation);
  }
  for (const body of context.rigidBodies ?? []) {
    values.push(
      body.index,
      body.boneIndex ?? -1,
      rigidBodyMotionTypeToNumber(body.motionType),
      rigidBodyShapeTypeToNumber(body.shape.type),
      body.mass ?? 0,
      body.linearDamping ?? 0,
      body.angularDamping ?? 0,
      body.restitution ?? 0,
      body.friction ?? 0,
      body.collisionGroup ?? -1,
      body.collisionMask ?? -1
    );
    pushNumbers(values, body.shape.size);
    pushNumbers(values, body.localTranslation);
    pushNumbers(values, body.localRotation);
  }
  for (const joint of context.joints ?? []) {
    values.push(joint.index, joint.rigidBodyIndexA, joint.rigidBodyIndexB);
    pushNumbers(values, joint.translation);
    pushNumbers(values, joint.rotation);
    pushNumbers(values, joint.linearLimit?.lower);
    pushNumbers(values, joint.linearLimit?.upper);
    pushNumbers(values, joint.angularLimit?.lower);
    pushNumbers(values, joint.angularLimit?.upper);
    pushNumbers(values, joint.spring?.linear);
    pushNumbers(values, joint.spring?.angular);
  }
  pushNumbers(values, context.inputTranslations);
  pushNumbers(values, context.inputRotations);
  pushNumbers(values, context.inputWorldMatricesColumnMajor);
  pushToggleNumbers(values, context.bonePhysicsToggles);
  for (const impulse of context.morphImpulses ?? []) {
    values.push(
      impulse.morphIndex,
      impulse.weight,
      impulse.rigidBodyIndex ?? -1,
      impulse.local ? 1 : 0
    );
    pushNumbers(values, impulse.force);
    pushNumbers(values, impulse.torque);
  }
  return values;
}

function pushNumbers(target, values) {
  if (!values) {
    return;
  }
  for (const value of values) {
    target.push(value);
  }
}

function pushToggleNumbers(target, values) {
  if (!values) {
    return;
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    target.push(value === true ? 1 : value === false ? 0 : value);
  }
}

function rigidBodyMotionTypeToNumber(type) {
  switch (type) {
    case "static":
      return 0;
    case "dynamic":
      return 1;
    case "dynamicWithBone":
      return 2;
    default:
      throw new Error(`Unsupported rigid body motion type: ${type}`);
  }
}

function rigidBodyShapeTypeToNumber(type) {
  switch (type) {
    case "sphere":
      return 0;
    case "box":
      return 1;
    case "capsule":
      return 2;
    default:
      throw new Error(`Unsupported rigid body shape type: ${type}`);
  }
}

function parseArgs(argv) {
  const result = {
    model: "test/fixtures/test_1bone_cube.pmx",
    motion: "test/fixtures/test_1bone_cube_motion.vmd",
    frames: [0, 1, 15, 30],
    frameRate: 30,
    maxError: Infinity,
    compareTarget: "matrices"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--model") {
      result.model = readOptionValue(argv, ++index, value);
    } else if (value === "--motion") {
      result.motion = readOptionValue(argv, ++index, value);
    } else if (value === "--frames") {
      result.frames = readNumberList(readOptionValue(argv, ++index, value), value);
    } else if (value === "--frame-rate") {
      result.frameRate = readPositiveNumber(readOptionValue(argv, ++index, value), value);
    } else if (value === "--max-error") {
      result.maxError = readPositiveNumber(readOptionValue(argv, ++index, value), value);
    } else if (value === "--compare-target") {
      result.compareTarget = readCompareTarget(readOptionValue(argv, ++index, value), value);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return result;
}

function readOptionValue(argv, index, option) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function readNumberList(value, option) {
  const values = value.split(",").map((entry) => Number.parseInt(entry.trim(), 10));
  if (values.length === 0 || values.some((entry) => !Number.isFinite(entry) || entry < 0)) {
    throw new Error(`${option} requires a comma-separated list of non-negative frame numbers`);
  }
  return values;
}

function readPositiveNumber(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive number`);
  }
  return parsed;
}

function readCompareTarget(value, option) {
  if (value !== "matrices" && value !== "sampling" && value !== "append" && value !== "ik" && value !== "morph" && value !== "camera" && value !== "light" && value !== "physics-handoff" && value !== "all") {
    throw new Error(`${option} requires one of: matrices, sampling, append, ik, morph, camera, light, physics-handoff, all`);
  }
  return value;
}
