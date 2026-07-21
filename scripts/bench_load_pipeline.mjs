// Full ThreeMmdLoader pipeline benchmark with performance profiling.
// Usage: node scripts/bench_load_pipeline.mjs [pmx-or-pmd-path] [repeat] [baseline|tsl|tsl-sparse]
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
const mode = process.argv[4] ?? "baseline";
if (mode !== "baseline" && mode !== "tsl" && mode !== "tsl-sparse") {
  throw new Error(`mode must be baseline, tsl, or tsl-sparse: ${mode}`);
}
const loadOptions = mode === "tsl" || mode === "tsl-sparse"
  ? {
      morphSplit: false,
      morphAttributes: mode !== "tsl-sparse",
      outline: false,
      materialRenderOrder: false
    }
  : {};

const bytes = new Uint8Array(readFileSync(filePath));
console.log(`\nFile: ${filePath}  (${(bytes.byteLength / 1024).toFixed(1)} KB)`);
console.log(`Mode: ${mode}`);
console.log(`Repeat: ${repeat} runs (1 cold + ${Math.max(repeat - 1, 0)} warm)\n`);

const runResults = [];
let modelSummary = null;

for (let runIndex = 0; runIndex < repeat; runIndex++) {
  const callbackMeasures = [];
  const loader = new ThreeMmdLoader({
    performance: {
      onMeasure: (measure) => {
        callbackMeasures.push(measure);
      }
    }
  });

  const model = await loader.loadModel(bytes, loadOptions);
  const perfMeasures =
    model.diagnostics.performance.length > 0
      ? [...model.diagnostics.performance]
      : callbackMeasures;

  if (runIndex === repeat - 1) {
    modelSummary = summarizeModel(model);
  }

  runResults.push(indexMeasuresByName(perfMeasures));
  disposeMmdModel(model);
}

if (modelSummary) {
  console.log(
    `Geometry: vertices=${modelSummary.vertices}  indices=${modelSummary.indices}  groups=${modelSummary.groups}  morphTargets=${modelSummary.morphTargets}  materials=${modelSummary.materials}  outlines=${modelSummary.outlines}  renderOrderProxies=${modelSummary.renderOrderProxies}\n`
  );
  printMorphStorageSummary(modelSummary.morphStorage);
}

printTimingTable(runResults);

function summarizeModel(model) {
  const geometry = model.mesh.geometry;
  const materials = Array.isArray(model.mesh.material) ? model.mesh.material.length : 1;
  return {
    vertices: geometry.getAttribute("position")?.count ?? 0,
    indices: geometry.index?.count ?? 0,
    groups: geometry.groups.length,
    morphTargets: model.mesh.morphTargetInfluences?.length ?? geometry.morphAttributes.position?.length ?? 0,
    materials,
    outlines: model.outlineMeshes?.length ?? 0,
    renderOrderProxies: model.renderOrderMeshes?.length ?? 0,
    morphStorage: summarizeMorphStorage(model)
  };
}

function summarizeMorphStorage(model) {
  const semanticsByName = new Map();
  let denseBytes = 0;
  let projectedSparseBytes = 0;
  let affectedSlots = 0;
  let totalSlots = 0;

  const bodyMeshes = Array.isArray(model.mesh.userData.mmdMorphSplitBodyMeshes)
    ? model.mesh.userData.mmdMorphSplitBodyMeshes
    : [];
  const geometries = [model.mesh.geometry, ...bodyMeshes.map((body) => body.geometry)];
  for (const geometry of geometries) {
    for (const [name, attributes] of Object.entries(geometry.morphAttributes)) {
      if (!attributes?.length) {
        continue;
      }
      const vertexCount = attributes[0]?.count ?? 0;
      const itemSize = attributes[0]?.itemSize ?? 0;
      let semanticDenseBytes = 0;
      let semanticAffectedSlots = 0;
      for (const attribute of attributes) {
        semanticDenseBytes += attribute.array.byteLength;
        for (let vertexIndex = 0; vertexIndex < attribute.count; vertexIndex += 1) {
          const base = vertexIndex * attribute.itemSize;
          let affected = false;
          for (let component = 0; component < attribute.itemSize; component += 1) {
            if (attribute.array[base + component] !== 0) {
              affected = true;
              break;
            }
          }
          if (affected) {
            semanticAffectedSlots += 1;
          }
        }
      }
      const semanticTotalSlots = vertexCount * attributes.length;
      const semanticProjectedSparseBytes =
        (vertexCount + 1) * Uint32Array.BYTES_PER_ELEMENT +
        semanticAffectedSlots * (Uint32Array.BYTES_PER_ELEMENT + itemSize * Float32Array.BYTES_PER_ELEMENT);
      const semantic = semanticsByName.get(name) ?? {
        name,
        targets: 0,
        itemSize,
        denseBytes: 0,
        projectedSparseBytes: 0,
        affectedSlots: 0,
        totalSlots: 0
      };
      semantic.targets += attributes.length;
      semantic.denseBytes += semanticDenseBytes;
      semantic.projectedSparseBytes += semanticProjectedSparseBytes;
      semantic.affectedSlots += semanticAffectedSlots;
      semantic.totalSlots += semanticTotalSlots;
      semanticsByName.set(name, semantic);
      denseBytes += semanticDenseBytes;
      projectedSparseBytes += semanticProjectedSparseBytes;
      affectedSlots += semanticAffectedSlots;
      totalSlots += semanticTotalSlots;
    }
  }

  return {
    semantics: [...semanticsByName.values()],
    denseBytes,
    projectedSparseBytes,
    affectedSlots,
    totalSlots
  };
}

function printMorphStorageSummary(summary) {
  console.log("Morph storage (logical dense buffers vs projected vertex-major CSR):");
  if (summary.semantics.length === 0) {
    console.log("  none\n");
    return;
  }
  for (const semantic of summary.semantics) {
    console.log(
      `  ${semantic.name.padEnd(10)} targets=${String(semantic.targets).padStart(4)}  ` +
      `occupancy=${formatPercent(semantic.affectedSlots, semantic.totalSlots).padStart(8)}  ` +
      `dense=${formatMiB(semantic.denseBytes).padStart(9)}  ` +
      `projected-csr=${formatMiB(semantic.projectedSparseBytes).padStart(9)}`
    );
  }
  console.log(
    `  ${"total".padEnd(10)} occupancy=${formatPercent(summary.affectedSlots, summary.totalSlots).padStart(8)}  ` +
    `dense=${formatMiB(summary.denseBytes).padStart(9)}  ` +
    `projected-csr=${formatMiB(summary.projectedSparseBytes).padStart(9)}  ` +
    `reduction=${formatReduction(summary.denseBytes, summary.projectedSparseBytes)}\n`
  );
}

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatPercent(value, total) {
  return total > 0 ? `${((value / total) * 100).toFixed(3)}%` : "n/a";
}

function formatReduction(denseBytes, sparseBytes) {
  return denseBytes > 0 ? `${((1 - sparseBytes / denseBytes) * 100).toFixed(1)}%` : "n/a";
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
