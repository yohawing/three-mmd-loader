// Full ThreeMmdLoader pipeline benchmark with performance profiling.
// Usage: node scripts/bench_load_pipeline.mjs [pmx-or-pmd-path] [repeat]
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const distIndexUrl = pathToFileURL(resolve(root, "dist", "index.js"));

const { ThreeMmdLoader, disposeMmdModel } = await import(distIndexUrl);

const PHASE_ORDER = [
  "read-bytes",
  "parse-model",
  "create-mesh",
  "load-textures",
  "material-metadata",
  "assemble-model",
  "total",
  "init-core",
  "parse-only",
  "init-runtime",
  "create-proxies"
];

const filePath = resolve(process.argv[2] ?? resolve(root, "test", "fixtures", "test_1bone_cube.pmx"));
const repeat = Number.parseInt(process.argv[3] ?? "5", 10);
if (!Number.isFinite(repeat) || repeat < 1) {
  throw new Error(`repeat must be a positive integer: ${process.argv[3]}`);
}

const bytes = new Uint8Array(readFileSync(filePath));
console.log(`\nFile: ${filePath}  (${(bytes.byteLength / 1024).toFixed(1)} KB)`);
console.log(`Repeat: ${repeat} runs (1 cold + ${Math.max(repeat - 1, 0)} warm)\n`);

const runResults = [];
let firstModelSummary = null;

for (let runIndex = 0; runIndex < repeat; runIndex++) {
  const callbackMeasures = [];
  const loader = new ThreeMmdLoader({
    performance: {
      onMeasure: (measure) => {
        callbackMeasures.push(measure);
      }
    }
  });

  const model = await loader.loadModel(bytes);
  const perfMeasures =
    model.diagnostics.performance.length > 0
      ? [...model.diagnostics.performance]
      : callbackMeasures;

  if (runIndex === 0) {
    firstModelSummary = summarizeModel(model);
  }

  runResults.push(indexMeasuresByName(perfMeasures));
  disposeMmdModel(model);
}

if (firstModelSummary) {
  console.log(
    `Geometry: vertices=${firstModelSummary.vertices}  indices=${firstModelSummary.indices}  groups=${firstModelSummary.groups}  morphTargets=${firstModelSummary.morphTargets}  materials=${firstModelSummary.materials}  outlines=${firstModelSummary.outlines}  renderOrderProxies=${firstModelSummary.renderOrderProxies}\n`
  );
}

printTimingTable(runResults);

function summarizeModel(model) {
  const geometry = model.mesh.geometry;
  const materials = Array.isArray(model.mesh.material) ? model.mesh.material.length : 1;
  return {
    vertices: geometry.getAttribute("position")?.count ?? 0,
    indices: geometry.index?.count ?? 0,
    groups: geometry.groups.length,
    morphTargets: geometry.morphAttributes.position?.length ?? 0,
    materials,
    outlines: model.outlineMeshes?.length ?? 0,
    renderOrderProxies: model.renderOrderMeshes?.length ?? 0
  };
}

function indexMeasuresByName(measures) {
  const byName = new Map();
  for (const measure of measures) {
    byName.set(measure.name, measure.durationMs);
  }
  return byName;
}

function collectPhaseNames(runResults) {
  const names = new Set(PHASE_ORDER);
  for (const run of runResults) {
    for (const name of run.keys()) {
      names.add(name);
    }
  }
  return [...names].sort((left, right) => {
    const leftIndex = PHASE_ORDER.indexOf(left);
    const rightIndex = PHASE_ORDER.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

function printTimingTable(runResults) {
  const phaseNames = collectPhaseNames(runResults);
  const cold = runResults[0];
  const warmRuns = runResults.slice(1);

  console.log("Phase timings (ms):");
  console.log(
    `${"phase".padEnd(22)}${"cold".padStart(10)}${"warm-avg".padStart(12)}${"warm-min".padStart(12)}${"warm-max".padStart(12)}`
  );
  console.log("-".repeat(68));

  for (const phaseName of phaseNames) {
    const coldMs = cold.get(phaseName);
    if (coldMs === undefined) {
      continue;
    }

    const warmValues = warmRuns
      .map((run) => run.get(phaseName))
      .filter((value) => value !== undefined);

    const warmStats = warmValues.length > 0 ? stats(warmValues) : null;
    console.log(
      `${phaseName.padEnd(22)}${formatMs(coldMs).padStart(10)}${formatWarm(warmStats?.avg).padStart(12)}${formatWarm(warmStats?.min).padStart(12)}${formatWarm(warmStats?.max).padStart(12)}`
    );
  }

  if (warmRuns.length === 0) {
    console.log("\nWarm comparison: skipped (repeat=1, cold run only)");
    return;
  }

  console.log("\nWarm speedup vs cold (cold / warm-avg):");
  for (const phaseName of phaseNames) {
    const coldMs = cold.get(phaseName);
    const warmValues = warmRuns
      .map((run) => run.get(phaseName))
      .filter((value) => value !== undefined);
    if (coldMs === undefined || warmValues.length === 0) {
      continue;
    }
    const warmAvg = stats(warmValues).avg;
    if (warmAvg <= 0) {
      continue;
    }
    const ratio = coldMs / warmAvg;
    console.log(`  ${phaseName.padEnd(22)} ${ratio.toFixed(2)}x`);
  }
}

function formatMs(value) {
  return value.toFixed(2);
}

function formatWarm(value) {
  return value === undefined ? "n/a" : value.toFixed(2);
}

function stats(values) {
  return {
    avg: average(values),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}