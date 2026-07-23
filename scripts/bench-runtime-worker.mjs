#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { resolve, dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { setInterval as startInterval, clearInterval } from "node:timers";

import { ThreeMmdLoader, disposeMmdModel } from "../dist/three/index.js";
import { createWorkerMmdRuntimeFactory } from "../dist/worker/index.js";

const projectRoot = resolve(import.meta.dirname, "..");
const defaultFixturesPath = resolve(projectRoot, "test/fixtures/fixtures.local.json");
const defaultWorkerUrl = resolve(projectRoot, "dist/worker/node-entry.js");
const UPDATE_P95_GATE_MS = 1.5;
const POSE_AGE_P95_GATE_FRAMES = 1;
const LONG_TASK_PROXY_THRESHOLD_MS = 50;
const WORKER_TIMEOUT_MS = 10_000;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  const fixtures = await readFixtureManifest(args.fixturesPath);
  const fixtureCases = resolveFixtureCases(fixtures, args.fixtureCases, args.fixturesPath);
  const results = [];
  for (const poolSize of args.poolSizes) {
    for (const characterCount of args.characterCounts) {
      results.push(await runMatrix({
        args,
        fixtureCases,
        characterCount,
        poolSize
      }));
    }
  }
  const output = {
    benchmark: "runtime-worker",
    runtime: {
      physics: args.physics,
      workerEntry: "dist/worker/node-entry.js",
      execArgv: [],
      poseAgeUnit: "frames",
      longTaskProxy: {
        field: "longTaskProxyCount",
        thresholdMs: LONG_TASK_PROXY_THRESHOLD_MS,
        note: "Node event-loop interval delay proxy; this is not the browser Long Tasks API."
      }
    },
    fixtures: args.fixturesPath,
    warmup: args.warmup,
    frames: args.frames,
    frameRate: args.frameRate,
    gates: {
      updateP95Ms: `< ${UPDATE_P95_GATE_MS}`,
      poseAgeP95Frames: `<= ${POSE_AGE_P95_GATE_FRAMES}`,
      fallbackCount: "=== 0",
      longTaskProxyCount: "=== 0"
    },
    matrices: results,
    passed: results.every((result) => result.gate.passed)
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.passed) {
    process.exitCode = 1;
  }
};

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function runMatrix({ args, fixtureCases, characterCount, poolSize }) {
  const fallbackState = { count: 0 };
  const factory = createWorkerMmdRuntimeFactory({
    poolSize,
    runtimeOptions: {
      frameRate: args.frameRate,
      physics: args.physics
    },
    onFallback: () => {
      fallbackState.count += 1;
    },
    workerFactory: () => new Worker(defaultWorkerUrl, {
      type: "module",
      execArgv: []
    })
  });
  const loadedModels = [];
  const runtimes = [];
  const updateDurations = [];
  const poseAges = [];
  let timeout = false;
  let longTaskProxyCount = 0;
  let workerReady = false;
  let startedAt = performance.now();
  try {
    const parsedCases = await loadFixtureInputs(fixtureCases, args.frameRate, args.physics, factory);
    if (parsedCases.length === 0) {
      throw new Error("At least one runtime-worker fixture case is required");
    }
    for (let characterIndex = 0; characterIndex < characterCount; characterIndex += 1) {
      const parsed = parsedCases[characterIndex % parsedCases.length];
      const model = await parsed.loader.loadModel(parsed.modelBytes, {
        outline: false,
        materialRenderOrder: false
      });
      model.setAnimation(parsed.animation);
      loadedModels.push(model);
      runtimes.push(model.runtime);
    }

    const ready = await waitUntil(
      () => runtimes.every((runtime) => isWorkerRuntime(runtime) ? runtime.workerReady() : true)
        || fallbackState.count > 0,
      WORKER_TIMEOUT_MS
    );
    if (!ready) {
      timeout = true;
    }

    startedAt = performance.now();
    const monitor = startLongTaskProxy();
    try {
      const totalFrames = args.warmup + args.frames;
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        const seconds = frameIndex / args.frameRate;
        for (let characterIndex = 0; characterIndex < loadedModels.length; characterIndex += 1) {
          const model = loadedModels[characterIndex];
          const updateStartedAt = performance.now();
          model.update(seconds, { physics: true });
          const updateDuration = performance.now() - updateStartedAt;
          if (frameIndex >= args.warmup) {
            updateDurations.push(updateDuration);
            const runtime = runtimes[characterIndex];
            poseAges.push(isWorkerRuntime(runtime) ? runtime.poseAgeFrames() : 0);
          }
        }
        await sleep(0);
      }
    } finally {
      longTaskProxyCount = monitor.stop();
    }

    const finalSeconds = (args.warmup + args.frames - 1) / args.frameRate;
    const settled = await waitUntil(
      () => runtimes.every((runtime) => {
        if (!isWorkerRuntime(runtime)) {
          return true;
        }
        return runtime.frameState().seconds >= finalSeconds || !runtime.workerReady();
      }),
      WORKER_TIMEOUT_MS
    );
    if (!settled) {
      timeout = true;
    }
    workerReady = runtimes.length > 0 && runtimes.every((runtime) =>
      isWorkerRuntime(runtime) && runtime.workerReady()
    );
  } finally {
    for (const model of loadedModels) {
      disposeMmdModel(model, { textures: "none" });
    }
    factory.dispose();
  }

  const update = summarizeDurations(updateDurations);
  const poseAge = summarizeDurations(poseAges);
  const wallTimeMs = performance.now() - startedAt;
  const gate = {
    updateP95: update.p95 < UPDATE_P95_GATE_MS,
    poseAgeP95: poseAge.p95 <= POSE_AGE_P95_GATE_FRAMES,
    fallback: fallbackState.count === 0,
    longTaskProxy: longTaskProxyCount === 0,
    timeout: !timeout,
    workerReady,
    passed: update.p95 < UPDATE_P95_GATE_MS
      && poseAge.p95 <= POSE_AGE_P95_GATE_FRAMES
      && fallbackState.count === 0
      && longTaskProxyCount === 0
      && !timeout
      && workerReady
  };
  return {
    characterCount,
    poolSize,
    fixtureCases: fixtureCases.map((fixtureCase) => fixtureCase.name),
    updateMs: update,
    poseAgeFrames: poseAge,
    wallTimeMs: round(wallTimeMs),
    fallbackCount: fallbackState.count,
    timeout,
    workerReady,
    longTaskProxyCount,
    gate
  };
}

async function loadFixtureInputs(fixtureCases, frameRate, physics, runtimeFactory) {
  const parsedCases = [];
  for (const fixtureCase of fixtureCases) {
    const modelBytes = await readFile(fixtureCase.modelPath);
    const motionBytes = await readFile(fixtureCase.motionPath);
    const loader = new ThreeMmdLoader({
      runtime: {
        frameRate,
        physics
      },
      runtimeFactory
    });
    const animation = await loader.loadAnimation(motionBytes);
    parsedCases.push({
      name: fixtureCase.name,
      modelBytes,
      animation: animation.animation,
      loader
    });
  }
  return parsedCases;
}

function startLongTaskProxy() {
  let count = 0;
  let previous = performance.now();
  const timer = startInterval(() => {
    const now = performance.now();
    if (now - previous > LONG_TASK_PROXY_THRESHOLD_MS) {
      count += 1;
    }
    previous = now;
  }, 10);
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
      return count;
    }
  };
}

async function waitUntil(predicate, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) {
      return false;
    }
    await sleep(5);
  }
  return true;
}

function summarizeDurations(values) {
  if (values.length === 0) {
    return { count: 0, p50: 0, p95: 0, max: 0 };
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1])
  };
}

function percentile(sorted, quantile) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

function isWorkerRuntime(runtime) {
  return typeof runtime.workerReady === "function"
    && typeof runtime.poseAgeFrames === "function"
    && typeof runtime.frameState === "function";
}

async function readFixtureManifest(fixturesPath) {
  const text = await readFile(fixturesPath, "utf8");
  return JSON.parse(text);
}

function resolveFixtureCases(fixtures, requestedNames, fixturesPath) {
  const candidates = fixtures.paths?.playbackSmoke?.cases;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("Fixture manifest has no playbackSmoke cases");
  }
  const byExtension = fixtures.paths?.releaseSmoke?.byExtension;
  if (!byExtension || typeof byExtension !== "object") {
    throw new Error("Fixture manifest has no releaseSmoke.byExtension paths");
  }
  const inventoryDir = dirname(resolve(fixturesPath));
  const root = resolve(inventoryDir, fixtures.basePath ?? ".");
  const names = requestedNames.length > 0 ? requestedNames : candidates
    .filter((candidate) => candidate.regressionTags?.includes("runtime-worker"))
    .map((candidate) => candidate.name);
  return names.map((name) => {
    const fixtureCase = candidates.find((candidate) => candidate.name === name);
    if (!fixtureCase) {
      throw new Error(`Fixture case not found: ${name}`);
    }
    const modelPath = resolveFixtureReference(root, byExtension, fixtureCase.model);
    const motionPath = resolveFixtureReference(root, byExtension, {
      extension: "vmd",
      key: fixtureCase.motion?.key
    });
    return {
      name,
      modelPath,
      motionPath
    };
  });
}

function resolveFixtureReference(root, byExtension, reference) {
  const relativePath = byExtension?.[reference.extension]?.[reference.key];
  if (typeof relativePath !== "string") {
    throw new Error(`Fixture path not found: ${reference.extension}/${reference.key}`);
  }
  return resolve(root, relativePath);
}

function parseArgs(argv) {
  const args = {
    fixturesPath: defaultFixturesPath,
    fixtureCases: [],
    characterCounts: [1, 4, 8],
    poolSizes: [1, 2, 3, 4],
    warmup: 30,
    frames: 120,
    frameRate: 30,
    physics: "stateful-spring",
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") {
      args.help = true;
    } else if (option === "--fixtures") {
      args.fixturesPath = resolve(readOption(argv, ++index, option));
    } else if (option === "--fixture-cases") {
      args.fixtureCases = readNameList(readOption(argv, ++index, option), option);
    } else if (option === "--character-counts") {
      args.characterCounts = readPositiveIntegerList(readOption(argv, ++index, option), option);
    } else if (option === "--pool-sizes") {
      args.poolSizes = readPositiveIntegerList(readOption(argv, ++index, option), option);
    } else if (option === "--warmup") {
      args.warmup = readNonNegativeInteger(readOption(argv, ++index, option), option);
    } else if (option === "--frames") {
      args.frames = readPositiveInteger(readOption(argv, ++index, option), option);
    } else if (option === "--frame-rate") {
      args.frameRate = readPositiveNumber(readOption(argv, ++index, option), option);
    } else if (option === "--physics") {
      args.physics = readOption(argv, ++index, option);
      if (args.physics !== "stateful-spring" && args.physics !== "none") {
        throw new Error("--physics must be stateful-spring or none; external custom Bullet is not wired yet");
      }
    } else {
      throw new Error(`Unknown argument: ${option}`);
    }
  }
  return args;
}

function readOption(argv, index, option) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function readNameList(value, option) {
  const names = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (names.length === 0) {
    throw new Error(`${option} requires at least one case name`);
  }
  return names;
}

function readPositiveIntegerList(value, option) {
  const entries = value.split(",").map((entry) => readPositiveInteger(entry.trim(), option));
  if (entries.length === 0) {
    throw new Error(`${option} requires at least one value`);
  }
  return entries;
}

function readPositiveInteger(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== String(value)) {
    throw new Error(`${option} requires positive integers`);
  }
  return parsed;
}

function readNonNegativeInteger(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== String(value)) {
    throw new Error(`${option} requires a non-negative integer`);
  }
  return parsed;
}

function readPositiveNumber(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive number`);
  }
  return parsed;
}

function round(value) {
  return Number(value.toFixed(3));
}

function printUsage() {
  console.log(`Usage: npm run bench:runtime:worker -- [options]

Defaults: --character-counts 1,4,8 --pool-sizes 1,2,3,4 --warmup 30 --frames 120
          --physics stateful-spring

Options:
  --fixtures PATH
  --fixture-cases CASE_A,CASE_B
  --character-counts N,N,...
  --pool-sizes N,N,...
  --warmup N
  --frames N
  --frame-rate N
  --physics stateful-spring|none
`);
}
