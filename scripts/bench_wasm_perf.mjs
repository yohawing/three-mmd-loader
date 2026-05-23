// Quick load-speed benchmark for the Wasm core and TypeScript fallback.
// Usage: node scripts/bench_wasm_perf.mjs [pmx-or-pmd-path] [repeat]
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const distIndexUrl = pathToFileURL(resolve(root, "dist", "index.js"));

const { FallbackCore, initCore, initCoreWithFallback } = await import(distIndexUrl);

const filePath = resolve(process.argv[2] ?? resolve(root, "test", "fixtures", "test_1bone_cube.pmx"));
const repeat = Number.parseInt(process.argv[3] ?? "5", 10);

const bytes = readFileSync(filePath);
console.log(`\nFile: ${filePath}  (${(bytes.length / 1024).toFixed(1)} KB)`);
console.log(`Repeat: ${repeat} runs\n`);

const t0 = performance.now();
let core;
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
}

console.log(`core version: ${core.version()}\n`);

core.loadModel(bytes);

const wasmTimes = [];
for (let i = 0; i < repeat; i++) {
  const s = performance.now();
  const model = core.loadModel(bytes);
  wasmTimes.push(performance.now() - s);

  if (i === 0) {
    const metadata = typeof model.metadata === "function" ? model.metadata() : model.metadata;
    const counts = metadata.counts;
    console.log(
      `  format=${metadata.format}  name="${metadata.name}"  vertices=${counts.vertices}  bones=${counts.bones}  morphs=${counts.morphs}  materials=${counts.materials}`
    );
  }
}

const wasmAvg = average(wasmTimes);
console.log(
  `\nloadModel(Wasm) avg=${wasmAvg.toFixed(2)} ms  min=${Math.min(...wasmTimes).toFixed(2)} ms  max=${Math.max(...wasmTimes).toFixed(2)} ms`
);

const fallbackCore = new FallbackCore();
fallbackCore.loadModel(bytes);

const fallbackTimes = [];
for (let i = 0; i < repeat; i++) {
  const s = performance.now();
  fallbackCore.loadModel(bytes);
  fallbackTimes.push(performance.now() - s);
}

const fallbackAvg = average(fallbackTimes);
console.log(
  `FallbackCore(TS) avg=${fallbackAvg.toFixed(2)} ms  min=${Math.min(...fallbackTimes).toFixed(2)} ms  max=${Math.max(...fallbackTimes).toFixed(2)} ms`
);
console.log(`\nWasm vs TS speedup: ${(fallbackAvg / wasmAvg).toFixed(2)}x`);

function average(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
