#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(options.manifestPath, "utf8"));
  validateManifest(manifest);
  const outputDir = options.outputDir;
  const reportPath = options.reportPath ?? path.join(outputDir, "..", "shadow-report.json");
  const results = [];

  for (const comparison of manifest.comparisons) {
    const result = await compareShadowPair(comparison, outputDir);
    results.push(result);
  }

  const pass = results.every(result => result.pass);
  const report = {
    generatedAt: new Date().toISOString(),
    pass,
    comparisons: results
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Compared ${results.length} self-shadow visual comparison(s).`);
  for (const result of results) {
    const status = result.pass ? "PASS" : "FAIL";
    console.log(
      `${status} ${result.name} meanDarkening=${format(result.receiverMeanDarkening)} ` +
        `p95Darkening=${format(result.receiverP95Darkening)} ` +
        `meanAbsDelta=${format(result.receiverMeanAbsDelta)} ` +
        `p95AbsDelta=${format(result.receiverP95AbsDelta)} ` +
        `shadowPixelRatio=${format(result.shadowPixelRatio)} ` +
        `shadowOnMeanLum=${format(result.shadowOnMeanLuminance)} ` +
        `shadowOnP05Lum=${format(result.shadowOnP05Luminance)} ` +
        `outsideRoiMeanDelta=${format(result.outsideRoiMeanDelta)}`
    );
  }
  console.log(`Report: ${path.relative(repoRoot, reportPath)}`);

  if (!pass) {
    process.exitCode = 1;
  }
}

async function compareShadowPair(comparison, outputDir) {
  const shadowOnPath = path.join(outputDir, `${comparison.shadowOn}.png`);
  const shadowOffPath = path.join(outputDir, `${comparison.shadowOff}.png`);
  const [shadowOn, shadowOff] = await Promise.all([readPng(shadowOnPath), readPng(shadowOffPath)]);
  if (shadowOn.width !== shadowOff.width || shadowOn.height !== shadowOff.height) {
    throw new Error(`Image size mismatch for ${comparison.name}`);
  }

  const roi = normalizeRoi(comparison.receiverRoi, shadowOn.width, shadowOn.height);
  const darkeningValues = [];
  const absDeltaValues = [];
  const shadowOnLuminanceValues = [];
  let darkeningSum = 0;
  let absDeltaSum = 0;
  let shadowOnLuminanceSum = 0;
  let shadowPixelCount = 0;
  let roiPixelCount = 0;
  let outsideDeltaSum = 0;
  let outsidePixelCount = 0;

  for (let y = 0; y < shadowOn.height; y += 1) {
    for (let x = 0; x < shadowOn.width; x += 1) {
      const offset = (y * shadowOn.width + x) * 4;
      const onLum = luminance(shadowOn.data, offset);
      const offLum = luminance(shadowOff.data, offset);
      if (x >= roi.x && x < roi.x + roi.width && y >= roi.y && y < roi.y + roi.height) {
        const darkening = Math.max(0, offLum - onLum);
        const absDelta = Math.abs(offLum - onLum);
        darkeningValues.push(darkening);
        absDeltaValues.push(absDelta);
        shadowOnLuminanceValues.push(onLum);
        darkeningSum += darkening;
        absDeltaSum += absDelta;
        shadowOnLuminanceSum += onLum;
        roiPixelCount += 1;
        if (darkening >= 0.035) {
          shadowPixelCount += 1;
        }
      } else {
        outsideDeltaSum += Math.abs(offLum - onLum);
        outsidePixelCount += 1;
      }
    }
  }

  darkeningValues.sort((a, b) => a - b);
  absDeltaValues.sort((a, b) => a - b);
  shadowOnLuminanceValues.sort((a, b) => a - b);
  const receiverMeanDarkening = darkeningSum / Math.max(1, roiPixelCount);
  const receiverMeanAbsDelta = absDeltaSum / Math.max(1, roiPixelCount);
  const receiverP95Darkening =
    darkeningValues[Math.min(darkeningValues.length - 1, Math.ceil(darkeningValues.length * 0.95) - 1)] ?? 0;
  const receiverP95AbsDelta =
    absDeltaValues[Math.min(absDeltaValues.length - 1, Math.ceil(absDeltaValues.length * 0.95) - 1)] ?? 0;
  const shadowPixelRatio = shadowPixelCount / Math.max(1, roiPixelCount);
  const shadowOnMeanLuminance = shadowOnLuminanceSum / Math.max(1, roiPixelCount);
  const shadowOnP05Luminance =
    shadowOnLuminanceValues[Math.min(shadowOnLuminanceValues.length - 1, Math.floor(shadowOnLuminanceValues.length * 0.05))] ?? 0;
  const outsideRoiMeanDelta = outsideDeltaSum / Math.max(1, outsidePixelCount);
  const thresholds = normalizeThresholds(comparison.thresholds);
  const pass =
    receiverMeanAbsDelta >= thresholds.receiverMeanAbsDeltaMin &&
    receiverP95AbsDelta >= thresholds.receiverP95AbsDeltaMin &&
    receiverMeanDarkening >= thresholds.receiverMeanDarkeningMin &&
    receiverP95Darkening >= thresholds.receiverP95DarkeningMin &&
    shadowPixelRatio >= thresholds.shadowPixelRatioMin &&
    shadowOnMeanLuminance >= thresholds.shadowOnMeanLuminanceMin &&
    shadowOnP05Luminance >= thresholds.shadowOnP05LuminanceMin &&
    outsideRoiMeanDelta <= thresholds.outsideRoiMeanDeltaMax;

  return {
    name: comparison.name,
    shadowOn: comparison.shadowOn,
    shadowOff: comparison.shadowOff,
    receiverRoi: roi,
    receiverMeanAbsDelta: round(receiverMeanAbsDelta),
    receiverP95AbsDelta: round(receiverP95AbsDelta),
    receiverMeanDarkening: round(receiverMeanDarkening),
    receiverP95Darkening: round(receiverP95Darkening),
    shadowPixelRatio: round(shadowPixelRatio),
    shadowOnMeanLuminance: round(shadowOnMeanLuminance),
    shadowOnP05Luminance: round(shadowOnP05Luminance),
    outsideRoiMeanDelta: round(outsideRoiMeanDelta),
    thresholds,
    pass
  };
}

function normalizeRoi(roi, width, height) {
  if (!roi || typeof roi !== "object") {
    throw new Error("Each self-shadow comparison must define receiverRoi");
  }
  const normalized = {
    x: integerInRange(roi.x, 0, width - 1, "receiverRoi.x"),
    y: integerInRange(roi.y, 0, height - 1, "receiverRoi.y"),
    width: integerInRange(roi.width, 1, width, "receiverRoi.width"),
    height: integerInRange(roi.height, 1, height, "receiverRoi.height")
  };
  if (normalized.x + normalized.width > width || normalized.y + normalized.height > height) {
    throw new Error(`receiverRoi exceeds image bounds: ${JSON.stringify(normalized)}`);
  }
  return normalized;
}

function integerInRange(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function normalizeThresholds(thresholds) {
  return {
    receiverMeanDarkeningMin: numberOr(thresholds?.receiverMeanDarkeningMin, 0.025),
    receiverP95DarkeningMin: numberOr(thresholds?.receiverP95DarkeningMin, 0.08),
    receiverMeanAbsDeltaMin: numberOr(thresholds?.receiverMeanAbsDeltaMin, 0),
    receiverP95AbsDeltaMin: numberOr(thresholds?.receiverP95AbsDeltaMin, 0),
    shadowPixelRatioMin: numberOr(thresholds?.shadowPixelRatioMin, 0.04),
    shadowOnMeanLuminanceMin: numberOr(thresholds?.shadowOnMeanLuminanceMin, 0),
    shadowOnP05LuminanceMin: numberOr(thresholds?.shadowOnP05LuminanceMin, 0),
    outsideRoiMeanDeltaMax: numberOr(thresholds?.outsideRoiMeanDeltaMax, 0.08)
  };
}

function numberOr(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid self-shadow threshold: ${value}`);
  }
  return value;
}

function luminance(data, offset) {
  const r = srgbToLinear(data[offset] / 255);
  const g = srgbToLinear(data[offset + 1] / 255);
  const b = srgbToLinear(data[offset + 2] / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

async function readPng(filePath) {
  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(new PNG())
      .on("parsed", function onParsed() {
        resolve(this);
      })
      .on("error", error => {
        reject(new Error(`Failed to read PNG ${path.relative(repoRoot, filePath)}: ${error.message}`));
      });
  });
}

function validateManifest(manifest) {
  if (!Array.isArray(manifest.cases) || !Array.isArray(manifest.comparisons)) {
    throw new Error("Self-shadow manifest must include cases and comparisons arrays");
  }
  const caseNames = new Set(manifest.cases.map(visualCase => visualCase.name));
  for (const comparison of manifest.comparisons) {
    if (!caseNames.has(comparison.shadowOn)) {
      throw new Error(`Unknown shadowOn case in comparison ${comparison.name}: ${comparison.shadowOn}`);
    }
    if (!caseNames.has(comparison.shadowOff)) {
      throw new Error(`Unknown shadowOff case in comparison ${comparison.name}: ${comparison.shadowOff}`);
    }
  }
}

function parseArgs(args) {
  const options = {
    manifestPath: path.join(__dirname, "self-shadow.manifest.json"),
    outputDir: path.join(repoRoot, "test-results", "visual", "self-shadow", "current"),
    reportPath: undefined
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest") {
      options.manifestPath = path.resolve(requireValue(args, (index += 1), arg));
    } else if (arg === "--output-dir") {
      options.outputDir = path.resolve(requireValue(args, (index += 1), arg));
    } else if (arg === "--report") {
      options.reportPath = path.resolve(requireValue(args, (index += 1), arg));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function round(value) {
  return Number(value.toFixed(6));
}

function format(value) {
  return value.toFixed(6);
}

await main();
