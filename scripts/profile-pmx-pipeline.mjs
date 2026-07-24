// Profile the opt-in PMX parser sections and the Wasm-to-JavaScript bridge.
// Usage: node scripts/profile-pmx-pipeline.mjs <pmx-path> [repeat]
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const filePath = resolve(process.argv[2] ?? "");
const repeat = Number.parseInt(process.argv[3] ?? "5", 10);

if (process.argv[2] == null) {
  throw new Error("Usage: node scripts/profile-pmx-pipeline.mjs <pmx-path> [repeat]");
}
if (!Number.isFinite(repeat) || repeat < 1) {
  throw new Error(`repeat must be a positive integer: ${process.argv[3]}`);
}

const generatedDir = resolve(root, "src", "parser", "wasm", "generated");
const wasmModule = await import(pathToFileURL(resolve(generatedDir, "mmd_anim_wasm.js")));
await wasmModule.default({
  module_or_path: readFileSync(resolve(generatedDir, "mmd_anim_wasm_bg.wasm"))
});

const bytes = new Uint8Array(readFileSync(filePath));
const runs = [];
for (let index = 0; index < repeat; index++) {
  runs.push(profileOnce(wasmModule.WasmPmxParsedModel, bytes));
}

const sectionNames = runs[0].profile.sections.map((section) => section.name);
console.log(`File: ${filePath}`);
console.log(`Size: ${formatBytes(bytes.byteLength)}; repeat: ${repeat}`);
console.log("\nPMX parser sections (cold / warm median):");
for (const name of sectionNames) {
  const sections = runs.map((run) => run.profile.sections.find((section) => section.name === name));
  const sample = sections[0];
  printRow(name, sections.map((section) => section.durationNs / 1e6), sample.bytes);
}
printRow("parser total", runs.map((run) => run.profile.totalDurationNs / 1e6), bytes.byteLength);

console.log("\nWasm / JavaScript bridge (cold / warm median):");
for (const key of [
  "parseProfiled",
  "profileJson",
  "nonGeometryJson",
  "jsonParse",
  "geometryDto",
  "geometryGetters",
  "profiledPipeline"
]) {
  const byteCount = key === "nonGeometryJson"
    ? runs[0].nonGeometryJsonBytes
    : key === "geometryGetters" ? runs[0].geometryBytes : undefined;
  printRow(key, runs.map((run) => run.timings[key]), byteCount);
}

console.log("\nMachine-readable summary:");
console.log(JSON.stringify({
  file: filePath,
  inputBytes: bytes.byteLength,
  repeat,
  coldMs: runs[0].timings,
  warmMediansMs: Object.fromEntries(
    Object.keys(runs[0].timings).map((key) => [
      key,
      percentile((runs.length > 1 ? runs.slice(1) : runs).map((run) => run.timings[key]), 0.5)
    ])
  ),
  parserSections: sectionNames.map((name) => {
    const sections = runs.map((run) => run.profile.sections.find((section) => section.name === name));
    return {
      name,
      bytes: sections[0].bytes,
      coldMs: sections[0].durationNs / 1e6,
      warmMedianMs: percentile(
        (sections.length > 1 ? sections.slice(1) : sections)
          .map((section) => section.durationNs / 1e6),
        0.5
      )
    };
  }),
  geometryBytes: runs[0].geometryBytes,
  nonGeometryJsonBytes: runs[0].nonGeometryJsonBytes
}, null, 2));

function profileOnce(ParsedModel, input) {
  const pipelineStarted = performance.now();
  const parseStarted = performance.now();
  const handle = ParsedModel.parseProfiled(input);
  const parsedAt = performance.now();
  try {
    const profileJson = handle.profileJson();
    const profileJsonAt = performance.now();
    const profile = JSON.parse(profileJson);

    const nonGeometryJsonStarted = performance.now();
    const nonGeometryJson = handle.nonGeometryJson();
    const nonGeometryJsonAt = performance.now();
    JSON.parse(nonGeometryJson);
    const jsonParsedAt = performance.now();

    const geometry = handle.geometry();
    const geometryAt = performance.now();
    try {
      const arrays = [
        geometry.positions(),
        geometry.normals(),
        geometry.uvs(),
        geometry.additionalUvs(),
        geometry.indices(),
        geometry.materialGroups(),
        geometry.skinIndices(),
        geometry.skinWeights(),
        geometry.edgeScale(),
        geometry.sdefEnabled(),
        geometry.sdefC(),
        geometry.sdefR0(),
        geometry.sdefR1(),
        geometry.sdefRw0(),
        geometry.sdefRw1(),
        geometry.qdefEnabled()
      ];
      const gettersAt = performance.now();
      return {
        profile,
        nonGeometryJsonBytes: Buffer.byteLength(nonGeometryJson),
        geometryBytes: arrays.reduce((sum, array) => sum + array.byteLength, 0),
        timings: {
          parseProfiled: parsedAt - parseStarted,
          profileJson: profileJsonAt - parsedAt,
          nonGeometryJson: nonGeometryJsonAt - nonGeometryJsonStarted,
          jsonParse: jsonParsedAt - nonGeometryJsonAt,
          geometryDto: geometryAt - jsonParsedAt,
          geometryGetters: gettersAt - geometryAt,
          profiledPipeline: gettersAt - pipelineStarted
        }
      };
    } finally {
      geometry.free();
    }
  } finally {
    handle.free();
  }
}

function printRow(label, values, byteCount) {
  const cold = values[0];
  const warmMedian = percentile(values.length > 1 ? values.slice(1) : values, 0.5);
  const suffix = byteCount == null ? "" : `  ${formatBytes(byteCount)}`;
  console.log(`${label.padEnd(20)} cold=${cold.toFixed(2).padStart(9)} ms  warm=${warmMedian.toFixed(2).padStart(9)} ms${suffix}`);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function formatBytes(value) {
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}
