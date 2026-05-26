// Quick load-speed benchmark for the Wasm core and TypeScript fallback.
// Usage: node scripts/bench_wasm_perf.mjs [pmx-or-pmd-path] [repeat]
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const distIndexUrl = pathToFileURL(resolve(root, "dist", "index.js"));

const { FallbackCore, createThreeBufferGeometry, initCore, initCoreWithFallback } =
  await import(distIndexUrl);

const filePath = resolve(process.argv[2] ?? resolve(root, "test", "fixtures", "test_1bone_cube.pmx"));
const repeat = Number.parseInt(process.argv[3] ?? "5", 10);
if (!Number.isFinite(repeat) || repeat < 1) {
  throw new Error(`repeat must be a positive integer: ${process.argv[3]}`);
}

const bytes = readFileSync(filePath);
console.log(`\nFile: ${filePath}  (${(bytes.length / 1024).toFixed(1)} KB)`);
console.log(`Repeat: ${repeat} runs\n`);

const t0 = performance.now();
let core;
let coreLabel = "Wasm";
try {
  core = await initCore();
  const t1 = performance.now();
  console.log(`initCore (Wasm):     ${(t1 - t0).toFixed(2)} ms`);
}
catch (error) {
  const t1 = performance.now();
  const message = error instanceof Error ? error.message : String(error);
  console.log(`initCore failed (${(t1 - t0).toFixed(1)} ms): ${message}`);
  console.log("Falling back to TypeScript core...");
  core = await initCoreWithFallback();
  coreLabel = "initCoreWithFallback";
}

console.log(`core version: ${core.version()}\n`);

const wasmResult = benchmarkCore(coreLabel, core, bytes, repeat);
printModelSummary(wasmResult);

const fallbackCore = new FallbackCore();
const fallbackResult = benchmarkCore("TS fallback", fallbackCore, bytes, repeat);

printMetadataComparison(wasmResult, fallbackResult);
printTimingSummary(wasmResult, fallbackResult);

function benchmarkCore(label, targetCore, modelBytes, runCount) {
  const warmup = measureLoadAndGeometry(targetCore, modelBytes);
  disposeMeasurement(warmup);

  const loadTimes = [];
  const geometryTimes = [];
  const totalTimes = [];
  let metadata;
  let geometrySummary;
  for (let i = 0; i < runCount; i++) {
    const measurement = measureLoadAndGeometry(targetCore, modelBytes);
    loadTimes.push(measurement.loadMs);
    geometryTimes.push(measurement.geometryMs);
    totalTimes.push(measurement.totalMs);
    if (i === 0) {
      metadata = measurement.metadata;
      geometrySummary = measurement.geometrySummary;
    }
    disposeMeasurement(measurement);
  }
  return {
    label,
    metadata,
    geometrySummary,
    load: stats(loadTimes),
    geometry: stats(geometryTimes),
    total: stats(totalTimes)
  };
}

function measureLoadAndGeometry(targetCore, modelBytes) {
  const startedAt = performance.now();
  const model = targetCore.loadModel(modelBytes);
  const loadedAt = performance.now();
  const metadata = readMetadata(model);
  const geometry = createThreeBufferGeometry(model.geometry(), model.materials(), model.morphs());
  const finishedAt = performance.now();
  return {
    model,
    geometry,
    metadata,
    geometrySummary: summarizeGeometry(geometry),
    loadMs: loadedAt - startedAt,
    geometryMs: finishedAt - loadedAt,
    totalMs: finishedAt - startedAt
  };
}

function disposeMeasurement(measurement) {
  measurement.geometry.dispose();
  measurement.model.dispose?.();
}

function readMetadata(model) {
  return typeof model.metadata === "function" ? model.metadata() : model.metadata;
}

function summarizeGeometry(geometry) {
  return {
    vertices: geometry.getAttribute("position")?.count ?? 0,
    indices: geometry.index?.count ?? 0,
    groups: geometry.groups.length,
    morphTargets: geometry.morphAttributes.position?.length ?? 0
  };
}

function printModelSummary(result) {
  const counts = result.metadata.counts;
  console.log(
    `Model: format=${result.metadata.format}  name="${result.metadata.name}"  vertices=${counts.vertices}  faces=${counts.faces}  bones=${counts.bones}  morphs=${counts.morphs}  materials=${counts.materials}`
  );
  console.log(
    `Geometry: vertices=${result.geometrySummary.vertices}  indices=${result.geometrySummary.indices}  groups=${result.geometrySummary.groups}  morphTargets=${result.geometrySummary.morphTargets}\n`
  );
}

function printMetadataComparison(leftResult, rightResult) {
  const mismatches = metadataMismatches(leftResult.metadata, rightResult.metadata);
  if (mismatches.length === 0) {
    console.log(
      `Metadata: ${leftResult.label} and ${rightResult.label} match on format, names, and counts.`
    );
    return;
  }
  console.log(`Metadata mismatch (${mismatches.length}): ${mismatches.join(", ")}`);
}

function metadataMismatches(left, right) {
  const mismatches = [];
  for (const key of ["format", "version", "name", "englishName"]) {
    if (left[key] !== right[key]) {
      mismatches.push(key);
    }
  }
  for (const key of Object.keys(left.counts)) {
    if (left.counts[key] !== right.counts[key]) {
      mismatches.push(`counts.${key}`);
    }
  }
  return mismatches;
}

function printTimingSummary(wasmResult, fallbackResult) {
  console.log("\nTimings (ms, avg/min/max):");
  printStats(`${wasmResult.label} loadModel`, wasmResult.load);
  printStats(`${wasmResult.label} geometry`, wasmResult.geometry);
  printStats(`${wasmResult.label} total`, wasmResult.total);
  printStats(`${fallbackResult.label} loadModel`, fallbackResult.load);
  printStats(`${fallbackResult.label} geometry`, fallbackResult.geometry);
  printStats(`${fallbackResult.label} total`, fallbackResult.total);
  console.log(
    `\n${wasmResult.label} loadModel vs ${fallbackResult.label}: ${(fallbackResult.load.avg / wasmResult.load.avg).toFixed(2)}x`
  );
  console.log(
    `${wasmResult.label} loadModel + createThreeBufferGeometry vs ${fallbackResult.label}: ${(fallbackResult.total.avg / wasmResult.total.avg).toFixed(2)}x`
  );
}

function printStats(label, result) {
  console.log(
    `${label.padEnd(30)} avg=${result.avg.toFixed(2)}  min=${result.min.toFixed(2)}  max=${result.max.toFixed(2)}`
  );
}

function stats(values) {
  return {
    avg: average(values),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function average(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
