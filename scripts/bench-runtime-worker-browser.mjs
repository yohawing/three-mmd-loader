#!/usr/bin/env node
/* global PerformanceObserver, fetch, location, navigator, requestAnimationFrame, setTimeout, window */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";

import { browserLaunchOptions, isPathInside } from "./visual-regression/render-shared.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const defaultFixturesPath = resolve(projectRoot, "test/fixtures/fixtures.local.json");
const dataRoute = "/__mmd_data__/";
const workerDistRoute = "/__mmd_worker_dist__/";
const harnessRoute = "/__runtime_worker_harness__";
const UPDATE_P95_GATE_MS = 1.5;
const POSE_AGE_P95_GATE_FRAMES = 1;
const LONG_TASK_THRESHOLD_MS = 50;
const TIMEOUT_MS = 20_000;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  if (!existsSync(resolve(projectRoot, "dist", "three", "index.js"))) {
    throw new Error("dist/three/index.js is missing. Run npm run build first.");
  }
  const fixtures = JSON.parse(await readFile(args.fixturesPath, "utf8"));
  const fixtureCases = resolveFixtureCases(fixtures, args.fixtureCases, args.fixturesPath);
  const server = await startRuntimeServer(fixtures, args.fixturesPath, args.coopCoep);
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage();
    await page.goto(`${server.origin}${harnessRoute}`, { waitUntil: "domcontentloaded" });
    const matrices = [];
    for (const poolSize of args.poolSizes) {
      for (const characterCount of args.characterCounts) {
        const result = await page.evaluate(runBrowserMatrix, {
          fixtureCases,
          characterCount,
          poolSize,
          warmup: args.warmup,
          frames: args.frames,
          frameRate: args.frameRate,
          displayRate: args.displayRate,
          physics: args.physics,
          runtimeMode: args.runtimeMode,
          timeoutMs: TIMEOUT_MS,
          updateP95GateMs: UPDATE_P95_GATE_MS,
          poseAgeP95GateFrames: POSE_AGE_P95_GATE_FRAMES,
          longTaskThresholdMs: LONG_TASK_THRESHOLD_MS,
          workerDistRoute
        });
        matrices.push(result);
      }
    }
    const browserEnvironment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio: window.devicePixelRatio,
      crossOriginIsolated: globalThis.crossOriginIsolated === true
    }));
    const output = {
      benchmark: "runtime-worker-browser",
      fixtures: args.fixturesPath,
      warmup: args.warmup,
      frames: args.frames,
      frameRate: args.frameRate,
      displayRate: args.displayRate,
      runtime: {
        mode: args.runtimeMode,
        transport: args.runtimeMode === "inline"
          ? "inline"
          : args.coopCoep ? "shared-array-buffer" : "transferable",
        physics: args.physics,
        workerEntry: args.runtimeMode === "worker"
          ? `${workerDistRoute}worker/entry.js`
          : null,
        longTaskApi: "PerformanceObserver(type=longtask)",
        longTaskThresholdMs: LONG_TASK_THRESHOLD_MS,
        note: "Long Tasks API is browser-only; the Node event-loop proxy is reported separately by bench:runtime:worker.",
        coopCoepRequested: args.coopCoep
      },
      environment: {
        node: process.version,
        browser: browserEnvironment
      },
      evidence: {
        command: ["node", "scripts/bench-runtime-worker-browser.mjs", ...process.argv.slice(2)].join(" "),
        outputPath: args.outputPath ?? null,
        fixtureCases: fixtureCases.map((fixtureCase) => fixtureCase.name),
        sampleCountPerCharacter: args.frames,
        crossOriginIsolated: matrices.every((matrix) => matrix.crossOriginIsolated)
      },
      matrices,
      passed: args.runtimeMode === "worker"
        ? matrices.every((matrix) => matrix.gate.passed)
        : null
    };
    const serialized = `${JSON.stringify(output, null, 2)}\n`;
    if (args.outputPath) {
      await writeFile(args.outputPath, serialized, "utf8");
    }
    process.stdout.write(serialized);
    if (output.passed === false) {
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    await server.close();
  }
};

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function startRuntimeServer(fixtures, fixturesPath, coopCoep) {
  const dataRoot = typeof fixtures.basePath === "string"
    ? resolve(dirname(fixturesPath), fixtures.basePath)
    : undefined;
  const mimeTypes = new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".pmx", "application/octet-stream"],
    [".vmd", "application/octet-stream"],
    [".wasm", "application/wasm"]
  ]);
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === harnessRoute) {
        sendResponse(response, 200, "text/html; charset=utf-8", harnessHtml(), coopCoep);
        return;
      }
      const resolved = resolveRuntimePath(pathname, dataRoot);
      if (!resolved || !existsSync(resolved)) {
        sendResponse(response, 404, "text/plain; charset=utf-8", "Not found", coopCoep);
        return;
      }
      const source = await readFile(resolved);
      const extension = extname(resolved).toLowerCase();
      const body = pathname.startsWith(workerDistRoute) && (extension === ".js" || extension === ".mjs")
        ? rewriteWorkerModule(source.toString("utf8"))
        : source;
      const contentType = mimeTypes.get(extension) ?? "application/octet-stream";
      sendResponse(response, 200, contentType, body, coopCoep);
    } catch (error) {
      sendResponse(response, 500, "text/plain; charset=utf-8", String(error), coopCoep);
    }
  });
  return await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate browser benchmark server port"));
        return;
      }
      resolvePromise({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done()))
      });
    });
  });
}

function resolveRuntimePath(pathname, dataRoot) {
  if (pathname.startsWith(dataRoute)) {
    if (!dataRoot) {
      return undefined;
    }
    const relativePath = decodeURIComponent(pathname.slice(dataRoute.length));
    const filePath = resolve(dataRoot, relativePath);
    return isPathInside(filePath, dataRoot) ? filePath : undefined;
  }
  if (pathname.startsWith(workerDistRoute)) {
    const relativePath = decodeURIComponent(pathname.slice(workerDistRoute.length));
    const filePath = resolve(projectRoot, "dist", relativePath);
    return isPathInside(filePath, resolve(projectRoot, "dist")) ? filePath : undefined;
  }
  const relativePath = pathname === "/" ? "runtime-worker-browser.html" : decodeURIComponent(pathname.slice(1));
  const filePath = resolve(projectRoot, relativePath);
  return isPathInside(filePath, projectRoot) ? filePath : undefined;
}

function rewriteWorkerModule(source) {
  return source
    .replaceAll('from "three"', 'from "/node_modules/three/build/three.module.js"')
    .replaceAll('from "three/webgpu"', 'from "/node_modules/three/build/three.webgpu.js"')
    .replaceAll('from "three/tsl"', 'from "/node_modules/three/build/three.tsl.js"');
}

function sendResponse(response, status, contentType, body, coopCoep) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": contentType
  };
  if (coopCoep) {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
    headers["Cross-Origin-Embedder-Policy"] = "require-corp";
    headers["Cross-Origin-Resource-Policy"] = "same-origin";
  }
  response.writeHead(status, headers);
  response.end(body);
}

function harnessHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<script type="importmap">${JSON.stringify({ imports: {
    three: "/node_modules/three/build/three.module.js",
    "three/webgpu": "/node_modules/three/build/three.webgpu.js",
    "three/tsl": "/node_modules/three/build/three.tsl.js"
  } })}</script></head><body></body></html>`;
}

async function runBrowserMatrix(config) {
  const isWorkerRuntime = (runtime) => typeof runtime.workerReady === "function"
    && typeof runtime.poseAgeFrames === "function"
    && typeof runtime.frameState === "function";
  const waitUntil = async (predicate, timeoutMs) => {
    const deadline = performance.now() + timeoutMs;
    while (!predicate()) {
      if (performance.now() >= deadline) return false;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    }
    return true;
  };
  const summarize = (values) => {
    if (values.length === 0) return { count: 0, p50: 0, p95: 0, max: 0 };
    const sorted = [...values].sort((left, right) => left - right);
    return {
      count: sorted.length,
      p50: Number(sorted[Math.ceil(sorted.length * 0.5) - 1].toFixed(3)),
      p95: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)),
      max: Number(sorted[sorted.length - 1].toFixed(3))
    };
  };
  const createLongTaskObserver = (thresholdMs) => {
    let count = 0;
    const supported = typeof PerformanceObserver !== "undefined"
      && Array.isArray(PerformanceObserver.supportedEntryTypes)
      && PerformanceObserver.supportedEntryTypes.includes("longtask");
    const observer = supported ? new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= thresholdMs) count += 1;
      }
    }) : undefined;
    // Do not request buffered entries: module/fixture loading before the
    // measurement window would otherwise poison this matrix's gate.
    observer?.observe({ type: "longtask" });
    return { supported, count: () => count, stop: () => observer?.disconnect() };
  };
  const three = await import("/dist/three/index.js");
  const worker = config.runtimeMode === "worker"
    ? await import("/dist/worker/index.js")
    : undefined;
  const runtime = config.runtimeMode === "inline"
    ? await import("/dist/runtime/index.js")
    : undefined;
  const wasm = config.runtimeMode === "inline"
    ? await import("/dist/parser/wasm/generated/mmd_anim_wasm.js")
    : undefined;
  const physics = config.runtimeMode === "inline" && config.physics === "external"
    ? await import("/dist/physics/index.js")
    : undefined;
  let bulletModule;
  if (physics) {
    const bulletModuleKey = "__runtimeWorkerBenchBulletModule";
    globalThis[bulletModuleKey] ??= physics.loadCustomBulletMmdModule({
      scriptUrl: new URL(config.workerDistRoute + "physics/mmd/mmd_bullet.js", location.href).href
    });
    bulletModule = await globalThis[bulletModuleKey];
  }
  const fallbackState = { count: 0, errors: [] };
  const inlineBackends = [];
  const runtimeFactory = config.runtimeMode === "worker"
    ? worker.createWorkerMmdRuntimeFactory({
      poolSize: config.poolSize,
      runtimeOptions: { frameRate: config.frameRate, physics: config.physics },
      externalPhysics: config.physics === "external"
        ? { kind: "custom-bullet-mmd" }
        : undefined,
      sharedMemory: "auto",
      workerUrl: new URL(config.workerDistRoute + "worker/entry.js", location.href),
      onFallback: (error) => {
        fallbackState.count += 1;
        fallbackState.errors.push(error instanceof Error ? error.message : String(error));
      }
    })
    : ({ modelBytes }) => {
      const backend = physics && bulletModule
        ? physics.createCustomBulletMmdPhysicsBackend(bulletModule)
        : undefined;
      if (backend) inlineBackends.push(backend);
      return runtime.MmdAnimRuntime.fromPmxBytes(wasm, modelBytes, {
        frameRate: config.frameRate,
        physics: config.physics,
        physicsBackend: backend
      });
    };
  const models = [];
  const runtimes = [];
  const updateDurations = [];
  const poseAges = [];
  let timeout = false;
  const parsedCases = [];
  try {
    for (const fixtureCase of config.fixtureCases) {
      const [modelResponse, motionResponse] = await Promise.all([
        fetch(fixtureCase.modelUrl),
        fetch(fixtureCase.motionUrl)
      ]);
      if (!modelResponse.ok || !motionResponse.ok) {
        throw new Error(`Fixture fetch failed for ${fixtureCase.name}`);
      }
      const [modelBuffer, motionBuffer] = await Promise.all([
        modelResponse.arrayBuffer(),
        motionResponse.arrayBuffer()
      ]);
      const loader = new three.ThreeMmdLoader({
        runtime: { frameRate: config.frameRate, physics: config.physics },
        runtimeFactory
      });
      const animation = await loader.loadAnimation(new Uint8Array(motionBuffer));
      parsedCases.push({
        name: fixtureCase.name,
        modelBytes: new Uint8Array(modelBuffer),
        animation: animation.animation,
        loader
      });
    }
    for (let index = 0; index < config.characterCount; index += 1) {
      const parsed = parsedCases[index % parsedCases.length];
      const model = await parsed.loader.loadModel(parsed.modelBytes, {
        outline: false,
        materialRenderOrder: false
      });
      model.setAnimation(parsed.animation);
      models.push(model);
      runtimes.push(model.runtime);
    }
    const ready = await waitUntil(
      () => runtimes.every((runtime) => isWorkerRuntime(runtime) ? runtime.workerReady() : true)
        || fallbackState.count > 0,
      config.timeoutMs
    );
    if (!ready) {
      timeout = true;
    }
    const longTask = createLongTaskObserver(config.longTaskThresholdMs);
    const startedAt = performance.now();
    const physicsEnabled = config.physics !== "none";
    try {
      for (let frame = 0; frame < config.warmup + config.frames; frame += 1) {
        const seconds = frame / config.displayRate;
        for (let index = 0; index < models.length; index += 1) {
          const updateStartedAt = performance.now();
          models[index].update(seconds, { physics: physicsEnabled });
          const updateDuration = performance.now() - updateStartedAt;
          if (frame >= config.warmup) {
            updateDurations.push(updateDuration);
            const runtime = runtimes[index];
            if (isWorkerRuntime(runtime)) {
              poseAges.push(runtime.poseAgeFrames());
            }
          }
        }
        await new Promise((resolvePromise) => requestAnimationFrame(resolvePromise));
      }
      const finalSeconds = (config.warmup + config.frames - 1) / config.displayRate;
      const settled = await waitUntil(
        () => runtimes.every((runtime) => !isWorkerRuntime(runtime)
          || runtime.frameState().seconds >= finalSeconds
          || !runtime.workerReady()),
        config.timeoutMs
      );
      if (!settled) {
        timeout = true;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
    } finally {
      longTask.stop();
    }
    const workerReady = config.runtimeMode === "worker" && runtimes.length > 0 && runtimes.every((runtime) =>
      isWorkerRuntime(runtime) && runtime.workerReady()
    );
    const runtimeReady = config.runtimeMode === "inline" || workerReady;
    const sharedMemoryEnabled = runtimes.some((runtime) =>
      typeof runtime.sharedMemoryEnabled === "function" && runtime.sharedMemoryEnabled()
    );
    const update = summarize(updateDurations);
    const poseAge = summarize(poseAges);
    const result = {
      characterCount: config.characterCount,
      poolSize: config.poolSize,
      runtimeMode: config.runtimeMode,
      fixtureCases: config.fixtureCases.map((fixtureCase) => fixtureCase.name),
      updateMs: update,
      poseAgeFrames: poseAge,
      poseAgeApplicable: config.runtimeMode === "worker",
      wallTimeMs: Number((performance.now() - startedAt).toFixed(3)),
      longTaskCount: longTask.count(),
      longTaskApiSupported: longTask.supported,
      fallbackCount: fallbackState.count,
      fallbackErrors: fallbackState.errors,
      timeout,
      workerReady: config.runtimeMode === "worker" ? workerReady : null,
      runtimeReady,
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      sharedMemoryEnabled,
      gate: {
        productApplicable: config.runtimeMode === "worker",
        comparisonOnly: config.runtimeMode === "inline",
        updateP95: update.p95 < config.updateP95GateMs,
        poseAgeP95: config.runtimeMode !== "worker" || poseAge.p95 <= config.poseAgeP95GateFrames,
        longTaskApi: longTask.supported,
        longTask: longTask.count() === 0,
        fallback: fallbackState.count === 0,
        timeout: !timeout,
        workerReady: runtimeReady,
        passed: config.runtimeMode === "inline"
          ? null
          : update.p95 < config.updateP95GateMs
          && (config.runtimeMode !== "worker" || poseAge.p95 <= config.poseAgeP95GateFrames)
          && longTask.supported
          && longTask.count() === 0
          && fallbackState.count === 0
          && !timeout
          && runtimeReady
      }
    };
    return result;
  } finally {
    for (const model of models) {
      three.disposeMmdModel(model, { textures: "none" });
    }
    if (config.runtimeMode === "worker") runtimeFactory.dispose();
    for (const backend of inlineBackends) backend.dispose?.();
  }
}

function resolveFixtureCases(fixtures, requestedNames, fixturesPath) {
  const candidates = fixtures.paths?.playbackSmoke?.cases;
  const byExtension = fixtures.paths?.releaseSmoke?.byExtension;
  if (!Array.isArray(candidates) || !byExtension) {
    throw new Error("Fixture manifest is missing playbackSmoke cases or releaseSmoke paths");
  }
  const names = requestedNames.length > 0 ? requestedNames : candidates
    .filter((candidate) => candidate.regressionTags?.includes("runtime-worker"))
    .map((candidate) => candidate.name);
  if (names.length === 0) {
    throw new Error("At least one runtime-worker fixture case is required");
  }
  const dataRoot = typeof fixtures.basePath === "string"
    ? resolve(dirname(fixturesPath), fixtures.basePath)
    : undefined;
  return names.flatMap((name) => {
    const fixtureCase = candidates.find((candidate) => candidate.name === name);
    if (!fixtureCase) {
      throw new Error(`Fixture case not found: ${name}`);
    }
    const characters = [{ role: "primary", model: fixtureCase.model, motion: fixtureCase.motion }];
    if (fixtureCase.secondary) {
      characters.push({ role: "secondary", ...fixtureCase.secondary });
    }
    return characters.map((character) => {
      const modelPath = byExtension?.[character.model.extension]?.[character.model.key];
      const motionPath = byExtension?.vmd?.[character.motion.key];
      if (!dataRoot || typeof modelPath !== "string" || typeof motionPath !== "string") {
        throw new Error(`Fixture paths are unavailable for ${name}:${character.role}`);
      }
      return {
        name: characters.length === 1 ? name : `${name}:${character.role}`,
        modelUrl: fixtureDataUrl(dataRoot, modelPath),
        motionUrl: fixtureDataUrl(dataRoot, motionPath)
      };
    });
  });
}

function fixtureDataUrl(dataRoot, fixturePath) {
  const filePath = resolve(dataRoot, fixturePath);
  if (!isPathInside(filePath, dataRoot) || !existsSync(filePath)) {
    throw new Error(`Fixture path is unavailable: ${filePath}`);
  }
  const path = relative(dataRoot, filePath).split(sep).map(encodeURIComponent).join("/");
  return `${dataRoute}${path}`;
}

function parseArgs(argv) {
  const args = {
    fixturesPath: defaultFixturesPath,
    fixtureCases: [],
    characterCounts: [1, 2],
    poolSizes: [1],
    warmup: 30,
    frames: 120,
    frameRate: 30,
    displayRate: 60,
    physics: "external",
    runtimeMode: "worker",
    coopCoep: false,
    outputPath: undefined,
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
    } else if (option === "--display-rate") {
      args.displayRate = readPositiveNumber(readOption(argv, ++index, option), option);
    } else if (option === "--physics") {
      args.physics = readOption(argv, ++index, option);
      if (args.physics !== "external" && args.physics !== "stateful-spring" && args.physics !== "none") {
        throw new Error("--physics must be external, stateful-spring, or none");
      }
    } else if (option === "--runtime") {
      args.runtimeMode = readOption(argv, ++index, option);
      if (args.runtimeMode !== "worker" && args.runtimeMode !== "inline") {
        throw new Error("--runtime must be worker or inline");
      }
    } else if (option === "--coop-coep" || option === "--cross-origin-isolated") {
      args.coopCoep = true;
    } else if (option === "--output") {
      args.outputPath = resolve(readOption(argv, ++index, option));
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
  const values = value.split(",").map((entry) => readPositiveInteger(entry.trim(), option));
  if (values.length === 0) {
    throw new Error(`${option} requires at least one value`);
  }
  return values;
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

function printUsage() {
  console.log(`Usage: npm run bench:runtime:worker:browser -- [options]

Defaults: --character-counts 1,2 --pool-sizes 1 --warmup 30 --frames 120
          --physics external --display-rate 60

Options:
  --fixtures PATH
  --fixture-cases CASE_A,CASE_B
  --character-counts N,N,...
  --pool-sizes N,N,...
  --warmup N
  --frames N
  --frame-rate N
  --display-rate N
  --physics external|stateful-spring|none
  --runtime worker|inline
  --coop-coep (opt in to COOP/COEP and SharedArrayBuffer)
  --output PATH
`);
}
