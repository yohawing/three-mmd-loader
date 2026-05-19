#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(__dirname, "real-models.manifest.json");
const snapshotRoot = path.join(repoRoot, "test-results", "visual", "real-models-rest-pose");
const defaultThresholdDegrees = 0.1;
const defaultWatchBones = ["センター", "腰", "下半身", "上半身"];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await loadManifest(options.manifestPath);
  const selectedCases = selectCases(manifest.cases, options.caseName);
  const baselineDir = options.baselineDir ?? path.join(snapshotRoot, "baseline");
  const currentDir = options.currentDir ?? path.join(snapshotRoot, "current");
  const reportPath = options.reportPath ?? path.join(snapshotRoot, "report.json");

  await mkdir(path.dirname(reportPath), { recursive: true });

  const results = [];
  for (const visualCase of selectedCases) {
    const thresholdDegrees = numericThreshold(
      visualCase.restPoseThresholdDegrees,
      defaultThresholdDegrees
    );
    results.push(
      await compareCase({
        visualCase,
        baselineDir,
        currentDir,
        thresholdDegrees
      })
    );
  }

  const pass = results.every((result) => result.pass);
  const report = {
    generatedAt: new Date().toISOString(),
    pass,
    thresholdDegrees: defaultThresholdDegrees,
    cases: results
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Compared ${results.length} real-model rest pose snapshot case(s).`);
  for (const result of results) {
    const status = result.pass ? "PASS" : "FAIL";
    console.log(`${status} ${result.case} maxAngleDegrees=${formatMetric(result.maxAngleDegrees)}`);
  }
  console.log(`Report: ${path.relative(repoRoot, reportPath)}`);

  if (!pass) {
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = {
    baselineDir: undefined,
    currentDir: undefined,
    reportPath: undefined,
    caseName: undefined,
    manifestPath
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--baseline-dir") {
      options.baselineDir = path.resolve(requireRawValue(args, (index += 1), arg));
    } else if (arg === "--current-dir") {
      options.currentDir = path.resolve(requireRawValue(args, (index += 1), arg));
    } else if (arg === "--report") {
      options.reportPath = path.resolve(requireRawValue(args, (index += 1), arg));
    } else if (arg === "--case") {
      options.caseName = requireRawValue(args, (index += 1), arg);
    } else if (arg === "--manifest") {
      options.manifestPath = path.resolve(requireRawValue(args, (index += 1), arg));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function loadManifest(filePath) {
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(manifest.cases)) {
    throw new Error("Real-model manifest must include a cases array");
  }
  return manifest;
}

function selectCases(cases, caseName) {
  if (caseName === undefined) {
    return cases;
  }
  const selected = cases.filter((visualCase) => visualCase.name === caseName);
  if (selected.length === 0) {
    throw new Error(`Unknown real-model case: ${caseName}`);
  }
  return selected;
}

async function compareCase({ visualCase, baselineDir, currentDir, thresholdDegrees }) {
  const baselinePath = path.join(baselineDir, `${visualCase.name}.json`);
  const currentPath = path.join(currentDir, `${visualCase.name}.json`);
  if (!existsSync(baselinePath)) {
    throw new Error(`Missing baseline snapshot: ${path.relative(repoRoot, baselinePath)}`);
  }
  if (!existsSync(currentPath)) {
    throw new Error(`Missing current snapshot: ${path.relative(repoRoot, currentPath)}`);
  }

  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const current = JSON.parse(await readFile(currentPath, "utf8"));
  const watchBones = normalizeWatchBones(visualCase.watchBones);
  const boneResults = [];

  for (const boneName of watchBones) {
    const baselineBone = baseline.bones?.[boneName];
    const currentBone = current.bones?.[boneName];
    const result = compareBone(boneName, baselineBone, currentBone, thresholdDegrees);
    boneResults.push(result);
  }

  const maxAngleDegrees = Math.max(0, ...boneResults.map((result) => result.angleDegrees ?? 0));
  return {
    case: visualCase.name,
    thresholdDegrees,
    maxAngleDegrees: roundMetric(maxAngleDegrees),
    pass: boneResults.every((result) => result.pass),
    bones: boneResults
  };
}

function compareBone(boneName, baselineBone, currentBone, thresholdDegrees) {
  if (!baselineBone?.found && !currentBone?.found) {
    return { bone: boneName, found: false, pass: true };
  }
  if (!baselineBone?.found || !currentBone?.found) {
    return {
      bone: boneName,
      found: false,
      pass: false,
      reason: "bone found state changed"
    };
  }
  const localAngleDegrees = quaternionAngleDegrees(
    readQuaternion(baselineBone.localQuaternion),
    readQuaternion(currentBone.localQuaternion)
  );
  const hasBaselineWorld = baselineBone.worldQuaternion !== undefined;
  const hasCurrentWorld = currentBone.worldQuaternion !== undefined;
  if (hasBaselineWorld !== hasCurrentWorld) {
    return {
      bone: boneName,
      found: true,
      pass: false,
      reason: "world quaternion presence changed"
    };
  }
  const worldAngleDegrees = hasBaselineWorld
    ? quaternionAngleDegrees(
        readQuaternion(baselineBone.worldQuaternion),
        readQuaternion(currentBone.worldQuaternion)
      )
    : undefined;
  const maxAngleDegrees = Math.max(localAngleDegrees, worldAngleDegrees ?? 0);
  return {
    bone: boneName,
    found: true,
    localAngleDegrees: roundMetric(localAngleDegrees),
    worldAngleDegrees:
      worldAngleDegrees === undefined ? undefined : roundMetric(worldAngleDegrees),
    angleDegrees: roundMetric(maxAngleDegrees),
    pass: maxAngleDegrees <= thresholdDegrees
  };
}

function normalizeWatchBones(watchBones) {
  if (watchBones === undefined) {
    return defaultWatchBones;
  }
  return watchBones.filter((boneName) => typeof boneName === "string" && boneName.length > 0);
}

function readQuaternion(value) {
  if (
    value === undefined ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z) ||
    !Number.isFinite(value.w)
  ) {
    throw new Error("Snapshot quaternion must include finite x/y/z/w components");
  }
  return [value.x, value.y, value.z, value.w];
}

function quaternionAngleDegrees(a, b) {
  const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

function numericThreshold(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid rest pose quaternion threshold: ${value}`);
  }
  return value;
}

function roundMetric(value) {
  return Number(value.toFixed(6));
}

function formatMetric(value) {
  return value.toFixed(6);
}

function requireRawValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

await main();
