#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { DefaultMmdRuntime } from "../dist/runtime/index.js";
import { ThreeMmdLoader } from "../dist/three/index.js";

const projectRoot = resolve(import.meta.dirname, "..");
const args = await parseArgs(process.argv.slice(2));
const [modelBytes, motionBytes] = await Promise.all([
  readFile(args.modelPath),
  readFile(args.motionPath)
]);

const mmdAnimCase = await loadCase("mmd-anim", new ThreeMmdLoader({
  runtime: {
    frameRate: args.frameRate,
    physics: "none"
  }
}));
const jsCase = await loadCase("js", new ThreeMmdLoader({
  runtimeFactory: () => new DefaultMmdRuntime({
    frameRate: args.frameRate,
    physics: "none"
  })
}));

const frameSeconds = createFrameSeconds(args.frames, args.frameRate);
const results = [
  benchmarkCase(mmdAnimCase, frameSeconds, args),
  benchmarkCase(jsCase, frameSeconds, args)
];
const byLabel = Object.fromEntries(results.map((result) => [result.label, result]));

console.log(JSON.stringify({
  model: args.modelLabel,
  motion: args.motionLabel,
  frameRate: args.frameRate,
  frames: args.frames,
  warmup: args.warmup,
  iterations: args.iterations,
  mode: args.mode,
  runtimes: results.map((result) => ({
    label: result.label,
    className: result.className,
    totalMs: result.totalMs,
    perFrameUs: result.perFrameUs,
    fpsEquivalent: result.fpsEquivalent
  })),
  speedup: {
    mmdAnimVsJs: byLabel.js.perFrameUs / byLabel["mmd-anim"].perFrameUs
  }
}, null, 2));

async function loadCase(label, loader) {
  const model = await loader.loadModel(modelBytes);
  const animation = await loader.loadAnimation(motionBytes);
  model.setAnimation(animation);
  return { label, model, runtime: model.runtime };
}

function benchmarkCase(testCase, secondsList, options) {
  for (let index = 0; index < options.warmup; index += 1) {
    evaluateFrames(testCase, secondsList, options.mode);
  }
  const startedAt = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    evaluateFrames(testCase, secondsList, options.mode);
  }
  const totalMs = performance.now() - startedAt;
  const frameCount = secondsList.length * options.iterations;
  const perFrameUs = totalMs * 1000 / frameCount;
  return {
    label: testCase.label,
    className: testCase.runtime.constructor.name,
    totalMs: +totalMs.toFixed(3),
    perFrameUs: +perFrameUs.toFixed(3),
    fpsEquivalent: +(1_000_000 / perFrameUs).toFixed(1)
  };
}

function evaluateFrames(testCase, secondsList, mode) {
  if (mode === "model-update") {
    for (const seconds of secondsList) {
      testCase.model.update(seconds, { physics: false });
    }
    return;
  }
  for (const seconds of secondsList) {
    testCase.runtime.evaluate(seconds, { physics: false });
  }
}

async function parseArgs(argv) {
  const parsed = {
    modelPath: resolve(projectRoot, "test/fixtures/test_1bone_cube.pmx"),
    motionPath: resolve(projectRoot, "test/fixtures/test_1bone_cube_motion.vmd"),
    modelLabel: "test/fixtures/test_1bone_cube.pmx",
    motionLabel: "test/fixtures/test_1bone_cube_motion.vmd",
    frames: createFrameRange(0, 120, 1),
    frameRate: 30,
    iterations: 500,
    warmup: 50,
    mode: "runtime-evaluate",
    fixturesPath: resolve(projectRoot, "test/fixtures/fixtures.local.json"),
    fixtureCase: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--model") {
      parsed.modelPath = resolve(readOptionValue(argv, ++index, value));
      parsed.modelLabel = parsed.modelPath;
    } else if (value === "--motion") {
      parsed.motionPath = resolve(readOptionValue(argv, ++index, value));
      parsed.motionLabel = parsed.motionPath;
    } else if (value === "--frames") {
      parsed.frames = readFrameList(readOptionValue(argv, ++index, value));
    } else if (value === "--frame-range") {
      parsed.frames = readFrameRange(readOptionValue(argv, ++index, value));
    } else if (value === "--frame-rate") {
      parsed.frameRate = readPositiveNumber(readOptionValue(argv, ++index, value), value);
    } else if (value === "--iterations") {
      parsed.iterations = readPositiveInteger(readOptionValue(argv, ++index, value), value);
    } else if (value === "--warmup") {
      parsed.warmup = readNonNegativeInteger(readOptionValue(argv, ++index, value), value);
    } else if (value === "--mode") {
      parsed.mode = readMode(readOptionValue(argv, ++index, value));
    } else if (value === "--fixtures") {
      parsed.fixturesPath = resolve(readOptionValue(argv, ++index, value));
    } else if (value === "--fixture-case") {
      parsed.fixtureCase = readOptionValue(argv, ++index, value);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (parsed.fixtureCase) {
    await applyFixtureCase(parsed);
  }
  return parsed;
}

async function applyFixtureCase(parsed) {
  if (!existsSync(parsed.fixturesPath)) {
    throw new Error(`Fixture inventory not found: ${parsed.fixturesPath}`);
  }
  const fixtures = JSON.parse(await readFile(parsed.fixturesPath, "utf8"));
  const root = typeof fixtures.basePath === "string"
    ? resolve(dirname(parsed.fixturesPath), fixtures.basePath)
    : resolve(dirname(parsed.fixturesPath), "..");
  const fixtureCase = fixtures.paths?.playbackSmoke?.cases?.find((candidate) => candidate.name === parsed.fixtureCase);
  if (!fixtureCase) {
    throw new Error(`Fixture case not found: ${parsed.fixtureCase}`);
  }
  const byExtension = fixtures.paths?.releaseSmoke?.byExtension ?? {};
  parsed.modelPath = resolveFixturePath(root, byExtension, fixtureCase.model);
  parsed.motionPath = resolveFixturePath(root, byExtension, { extension: "vmd", key: fixtureCase.motion?.key });
  parsed.modelLabel = `fixture:${parsed.fixtureCase}:${fixtureCase.model.extension}/${fixtureCase.model.key}`;
  parsed.motionLabel = `fixture:${parsed.fixtureCase}:vmd/${fixtureCase.motion.key}`;
  parsed.frameRate = Number.isFinite(fixtureCase.frameRate) ? fixtureCase.frameRate : parsed.frameRate;
}

function resolveFixturePath(root, byExtension, reference) {
  const relativePath = byExtension[reference.extension]?.[reference.key];
  if (typeof relativePath !== "string") {
    throw new Error(`Fixture path not found: ${reference.extension}/${reference.key}`);
  }
  return resolve(root, relativePath);
}

function createFrameSeconds(frames, frameRate) {
  return frames.map((frame) => frame / frameRate);
}

function createFrameRange(start, end, step) {
  const frames = [];
  for (let frame = start; frame <= end; frame += step) {
    frames.push(frame);
  }
  return frames;
}

function readFrameRange(value) {
  const [start, end, step = "1"] = value.split(":");
  const startFrame = readNonNegativeInteger(start, "--frame-range start");
  const endFrame = readNonNegativeInteger(end, "--frame-range end");
  const stepFrames = readPositiveInteger(step, "--frame-range step");
  if (endFrame < startFrame) {
    throw new Error("--frame-range end must be greater than or equal to start");
  }
  return createFrameRange(startFrame, endFrame, stepFrames);
}

function readFrameList(value) {
  const frames = value.split(",").map((entry) => readNonNegativeInteger(entry.trim(), "--frames"));
  if (frames.length === 0) {
    throw new Error("--frames requires at least one frame");
  }
  return frames;
}

function readMode(value) {
  if (value === "runtime-evaluate" || value === "model-update") {
    return value;
  }
  throw new Error("--mode must be runtime-evaluate or model-update");
}

function readOptionValue(argv, index, option) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function readPositiveNumber(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive number`);
  }
  return parsed;
}

function readPositiveInteger(value, option) {
  const parsed = readNonNegativeInteger(value, option);
  if (parsed <= 0) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
}

function readNonNegativeInteger(value, option) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${option} requires a non-negative integer`);
  }
  return parsed;
}
