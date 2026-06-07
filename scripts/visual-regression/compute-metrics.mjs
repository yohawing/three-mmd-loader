#!/usr/bin/env node
import { existsSync, createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const visualRoot = path.join(repoRoot, "test-results", "visual");
const profiles = {
  "real-models": {
    manifestPath: path.join(__dirname, "real-models.manifest.json"),
    root: path.join(visualRoot, "real-models"),
    caseKey: "name"
  },
  "generated-pmx": {
    manifestPath: path.join(__dirname, "generated-pmx.manifest.json"),
    root: path.join(visualRoot, "generated-pmx"),
    caseKey: "name"
  },
  skinning: {
    manifestPath: path.join(__dirname, "skinning.manifest.json"),
    root: path.join(visualRoot, "skinning"),
    caseKey: "name"
  }
};
const defaultThresholds = { mean: 0.03, p95: 0.12, max: 1 };

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const profile = profiles[options.profile];
  if (profile === undefined) {
    throw new Error(`Unknown visual regression profile: ${options.profile}`);
  }
  const manifest = await loadManifest(options.manifestPath ?? profile.manifestPath);
  const selectedCases = selectCases(manifest.cases, options.caseId);
  const baselineDir = options.baselineDir ?? path.join(profile.root, "baseline");
  const currentDir = options.currentDir ?? path.join(profile.root, "current");
  const diffDir = options.diffDir ?? path.join(profile.root, "diff");
  const reportPath = options.reportPath ?? path.join(profile.root, "report.json");

  await mkdir(diffDir, { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });

  const results = [];
  for (const visualCase of selectedCases) {
    const caseId = visualCase[profile.caseKey];
    const baselinePath = path.join(baselineDir, `${caseId}.png`);
    const currentPath = path.join(currentDir, `${caseId}.png`);
    const diffPath = path.join(diffDir, `${caseId}.png`);
    const thresholds = normalizeThresholds(visualCase.thresholds);
    const result = await compareCase({
      id: caseId,
      baselinePath,
      currentPath,
      diffPath,
      thresholds,
      metric: options.metric,
      flipPath: options.flipPath
    });
    results.push(result);
  }

  const pass = results.every(result => result.pass);
  const report = {
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length
    },
    metric: options.metric,
    pass,
    cases: results
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Compared ${results.length} visual case(s) for profile ${options.profile}`);
  for (const result of results) {
    const status = result.pass ? "PASS" : "FAIL";
    console.log(
      formatResultLine(status, result)
    );
  }
  console.log(`Report: ${path.relative(repoRoot, reportPath)}`);

  if (!pass) {
    process.exitCode = 1;
  }
}

export async function compareCase({ id, baselinePath, currentPath, diffPath, thresholds, metric = "js", flipPath }) {
  if (!existsSync(baselinePath)) {
    throw new Error(`Missing baseline PNG for ${id}: ${path.relative(repoRoot, baselinePath)}`);
  }
  if (!existsSync(currentPath)) {
    throw new Error(`Missing current PNG for ${id}: ${path.relative(repoRoot, currentPath)}`);
  }

  const [baseline, current] = await Promise.all([readPng(baselinePath), readPng(currentPath)]);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new Error(
      `Image size mismatch for ${id}: baseline=${baseline.width}x${baseline.height}, current=${current.width}x${current.height}`
    );
  }

  if (metric === "flip") {
    return await compareCaseWithFlip({
      id,
      baselinePath,
      currentPath,
      diffPath,
      thresholds,
      flipPath
    });
  }

  const pixelCount = baseline.width * baseline.height;
  const distances = new Float64Array(pixelCount);
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  let sum = 0;
  let max = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const distance = perceptualDistance(baseline.data, current.data, offset);
    distances[pixel] = distance;
    sum += distance;
    max = Math.max(max, distance);
    writeHeatmapPixel(diff.data, offset, distance);
  }

  distances.sort();
  const mean = sum / pixelCount;
  const p95 = distances[Math.min(distances.length - 1, Math.ceil(distances.length * 0.95) - 1)];
  const pass = mean <= thresholds.mean && p95 <= thresholds.p95;

  await writePng(diff, diffPath);

  return {
    case: id,
    metric,
    mean: roundMetric(mean),
    p95: roundMetric(p95),
    max: roundMetric(max),
    thresholds,
    pass
  };
}

export async function compareCaseWithFlip({ id, baselinePath, currentPath, diffPath, thresholds, flipPath }) {
  const executable = flipPath ?? process.env.NVIDIA_FLIP_PATH ?? process.env.FLIP_EXECUTABLE ?? "flip";
  const diffBasePath = diffPath.replace(/\.png$/i, "");
  const { stdout, stderr } = await runFlip(executable, [
    "--reference",
    baselinePath,
    "--test",
    currentPath,
    "--basename",
    diffBasePath
  ]);
  const metrics = parseFlipOutput(stdout);
  const pass = metrics.mean <= thresholds.mean && metrics.max <= thresholds.max;

  return {
    case: id,
    metric: "flip",
    mean: roundMetric(metrics.mean),
    p95: undefined,
    max: roundMetric(metrics.max),
    thresholds,
    diffPath: path.relative(repoRoot, `${diffBasePath}.png`),
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    pass
  };
}

export function parseFlipOutput(output) {
  const mean = parseMetric(output, "Mean");
  const max = parseMetric(output, "Max");
  return { mean, max };
}

export function perceptualDistance(baselineData, currentData, offset) {
  const baseAlpha = baselineData[offset + 3] / 255;
  const currentAlpha = currentData[offset + 3] / 255;
  const alphaDelta = Math.abs(baseAlpha - currentAlpha);
  const dr = srgbToLinear(baselineData[offset] / 255) - srgbToLinear(currentData[offset] / 255);
  const dg = srgbToLinear(baselineData[offset + 1] / 255) - srgbToLinear(currentData[offset + 1] / 255);
  const db = srgbToLinear(baselineData[offset + 2] / 255) - srgbToLinear(currentData[offset + 2] / 255);
  const colorDistance = Math.sqrt(0.2126 * dr * dr + 0.7152 * dg * dg + 0.0722 * db * db);

  return Math.min(1, Math.sqrt(colorDistance * colorDistance + alphaDelta * alphaDelta));
}

function writeHeatmapPixel(data, offset, distance) {
  const clamped = Math.max(0, Math.min(1, distance));
  const intensity = Math.round(clamped * 255);
  const red = clamped < 0.5 ? Math.round(clamped * 2 * 255) : 255;
  const green = clamped < 0.5 ? 255 : Math.round((1 - (clamped - 0.5) * 2) * 255);

  data[offset] = red;
  data[offset + 1] = green;
  data[offset + 2] = 0;
  data[offset + 3] = intensity;
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function roundMetric(value) {
  return Number(value.toFixed(6));
}

function formatMetric(value) {
  if (value === undefined) {
    return "n/a";
  }
  return value.toFixed(6);
}

function formatResultLine(status, result) {
  return `${status} ${result.case} metric=${result.metric} mean=${formatMetric(result.mean)} p95=${formatMetric(result.p95)} max=${formatMetric(result.max)}`;
}

async function readPng(filePath) {
  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(new PNG())
      .on("parsed", function onParsed() {
        resolve(this);
      })
      .on("error", reject);
  });
}

async function writePng(png, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  return new Promise((resolve, reject) => {
    png.pack()
      .pipe(createWriteStream(filePath))
      .on("finish", resolve)
      .on("error", reject);
  });
}

async function loadManifest(filePath) {
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(manifest.cases)) {
    throw new Error("Manifest must include a cases array");
  }
  return manifest;
}

function selectCases(cases, caseId) {
  if (caseId === undefined) {
    return cases;
  }

  const selected = cases.filter(visualCase => visualCase.id === caseId || visualCase.name === caseId);
  if (selected.length === 0) {
    throw new Error(`Unknown visual regression case: ${caseId}`);
  }
  return selected;
}

function normalizeThresholds(thresholds) {
  return {
    mean: numericThreshold(thresholds?.mean, defaultThresholds.mean, "mean"),
    p95: numericThreshold(thresholds?.p95, defaultThresholds.p95, "p95"),
    max: numericThreshold(thresholds?.max, defaultThresholds.max, "max")
  };
}

function numericThreshold(value, fallback, name) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${name} threshold: ${value}`);
  }
  return value;
}

function parseArgs(args) {
  const options = {
    baselineDir: undefined,
    currentDir: undefined,
    diffDir: undefined,
    reportPath: undefined,
    manifestPath: undefined,
    caseId: undefined,
    profile: "generated-pmx",
    metric: "js",
    flipPath: undefined
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--baseline-dir") {
      options.baselineDir = requireValue(args, (index += 1), arg);
    } else if (arg === "--current-dir") {
      options.currentDir = requireValue(args, (index += 1), arg);
    } else if (arg === "--diff-dir") {
      options.diffDir = requireValue(args, (index += 1), arg);
    } else if (arg === "--report") {
      options.reportPath = requireValue(args, (index += 1), arg);
    } else if (arg === "--manifest") {
      options.manifestPath = requireValue(args, (index += 1), arg);
    } else if (arg === "--case") {
      options.caseId = requireRawValue(args, (index += 1), arg);
    } else if (arg === "--profile") {
      options.profile = requireRawValue(args, (index += 1), arg);
    } else if (arg === "--metric") {
      const metric = requireRawValue(args, (index += 1), arg);
      if (metric !== "js" && metric !== "flip") {
        throw new Error("--metric must be one of: js, flip");
      }
      options.metric = metric;
    } else if (arg === "--flip-path") {
      options.flipPath = requireRawValue(args, (index += 1), arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseMetric(output, label) {
  const match = new RegExp(`${label}:\\s*([0-9]+(?:\\.[0-9]+)?)`, "i").exec(output);
  if (match === null) {
    throw new Error(`Unable to parse NVIDIA FLIP ${label} from output`);
  }
  return Number(match[1]);
}

function runFlip(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", error => {
      reject(new Error(`Failed to run NVIDIA FLIP executable "${executable}": ${error.message}`));
    });
    child.on("close", code => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`NVIDIA FLIP exited with code ${code}\n${stderr || stdout}`));
    });
  });
}

function requireValue(args, index, flag) {
  return path.resolve(requireRawValue(args, index, flag));
}

function requireRawValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
