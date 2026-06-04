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

const [modelBytes, motionBytes] = await Promise.all([
  readFile(modelPath),
  readFile(motionPath)
]);

const mmdAnimCase = await loadCase("mmd-anim", new ThreeMmdLoader({
  runtime: {
    frameRate,
    physics: "none"
  }
}));
const jsCase = await loadCase("js", new ThreeMmdLoader({
  runtimeFactory: () => new DefaultMmdRuntime({
    frameRate,
    physics: "none"
  })
}));

const summary = {
  model: args.model,
  motion: args.motion,
  frameRate,
  frames: [],
  maxAbsError: 0,
  rmsError: 0,
  comparedValues: 0,
  finite: true
};

let squaredErrorSum = 0;

for (const frame of frames) {
  const seconds = frame / frameRate;
  const mmdAnimMatrices = evaluateCase(mmdAnimCase, seconds);
  const jsMatrices = evaluateCase(jsCase, seconds);
  const metrics = compareMatrices(mmdAnimMatrices, jsMatrices);
  summary.frames.push({
    frame,
    seconds,
    maxAbsError: metrics.maxAbsError,
    rmsError: metrics.rmsError,
    comparedValues: metrics.comparedValues,
    finite: metrics.finite
  });
  summary.maxAbsError = Math.max(summary.maxAbsError, metrics.maxAbsError);
  summary.comparedValues += metrics.comparedValues;
  squaredErrorSum += metrics.squaredErrorSum;
  summary.finite &&= metrics.finite;
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

async function loadCase(label, loader) {
  const model = await loader.loadModel(modelBytes);
  const animation = await loader.loadAnimation(motionBytes);
  model.runtime.setAnimation(animation.animation, model.mesh);
  return { label, model, runtime: model.runtime };
}

function evaluateCase(testCase, seconds) {
  testCase.runtime.evaluate(seconds, { physics: false });
  return testCase.runtime.debugState().stages.physics.worldMatricesColumnMajor;
}

function compareMatrices(candidate, baseline) {
  if (candidate.length !== baseline.length) {
    throw new Error(`Matrix length mismatch: candidate=${candidate.length}, baseline=${baseline.length}`);
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
    finite
  };
}

function parseArgs(argv) {
  const result = {
    model: "test/fixtures/test_1bone_cube.pmx",
    motion: "test/fixtures/test_1bone_cube_motion.vmd",
    frames: [0, 1, 15, 30],
    frameRate: 30,
    maxError: Infinity
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
