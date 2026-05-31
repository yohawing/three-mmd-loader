#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const outputRoot = path.join(repoRoot, "test-results", "visual", "local-self-shadow");
const viewerLighting = {
  background: "#ffffff",
  ambient: { color: "#ffffff", intensity: 0.15 },
  directional: {
    color: "#ffffff",
    intensity: 1.0,
    position: [3, 4, 5],
    target: [0, 0.9, 0]
  }
};

async function main() {
  const options = await resolveOptions(parseArgs(process.argv.slice(2)));
  const currentDir = path.join(options.outputDir, "current");
  await mkdir(currentDir, { recursive: true });

  const onManifestPath = path.join(options.outputDir, "manifest-on.json");
  const offManifestPath = path.join(options.outputDir, "manifest-off.json");
  await writeFile(onManifestPath, `${JSON.stringify(createManifest(options, true), null, 2)}\n`);
  await writeFile(offManifestPath, `${JSON.stringify(createManifest(options, false), null, 2)}\n`);

  await runNodeScript("scripts/visual-regression/render-real-models.mjs", [
    "--manifest", onManifestPath,
    "--data-root", options.dataRoot,
    "--output-dir", currentDir
  ]);
  await runNodeScript("scripts/visual-regression/render-real-models.mjs", [
    "--manifest", offManifestPath,
    "--data-root", options.dataRoot,
    "--output-dir", currentDir
  ]);

  const offPng = path.join(currentDir, `${options.caseName}-off.png`);
  const onPng = path.join(currentDir, `${options.caseName}-on.png`);
  await writeComparisonImages(offPng, onPng, options.outputDir, options.caseName);

  console.log(`Local self-shadow pair written to ${path.relative(repoRoot, options.outputDir)}`);
  console.log(`  ${path.relative(repoRoot, path.join(options.outputDir, `${options.caseName}-pair.png`))}`);
  console.log(`  ${path.relative(repoRoot, path.join(options.outputDir, `${options.caseName}-crop-diff.png`))}`);
}

function parseArgs(args) {
  const options = {
    dataRoot: process.env.MMD_DATA_ROOT,
    model: process.env.MMD_SELF_SHADOW_MODEL,
    motion: process.env.MMD_SELF_SHADOW_MOTION,
    timeSeconds: numberOr(process.env.MMD_SELF_SHADOW_TIME, 4),
    caseName: process.env.MMD_SELF_SHADOW_CASE ?? "local-self-shadow",
    outputDir: outputRoot
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--data-root") {
      options.dataRoot = path.resolve(requireValue(args, (index += 1), arg));
    } else if (arg === "--model") {
      options.model = requireValue(args, (index += 1), arg);
    } else if (arg === "--motion") {
      options.motion = requireValue(args, (index += 1), arg);
    } else if (arg === "--time") {
      options.timeSeconds = numberOr(requireValue(args, (index += 1), arg), undefined);
    } else if (arg === "--case") {
      options.caseName = requireValue(args, (index += 1), arg);
    } else if (arg === "--output-dir") {
      options.outputDir = path.resolve(requireValue(args, (index += 1), arg));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.caseName)) {
    throw new Error(`--case must be kebab-case: ${options.caseName}`);
  }
  return options;
}

async function resolveOptions(options) {
  if (options.dataRoot && options.model) {
    return options;
  }

  const localFixturesPath = path.join(repoRoot, "test", "fixtures", "fixtures.local.json");
  if (existsSync(localFixturesPath)) {
    const fixtures = JSON.parse(await readFile(localFixturesPath, "utf8"));
    options.dataRoot ??= path.resolve(fixtures.basePath);
    options.model ??= fixtures.paths?.releaseSmoke?.byExtension?.pmx?.pmx020;
    options.motion ??= fixtures.paths?.releaseSmoke?.byExtension?.vmd?.vmd109;
    if (options.caseName === "local-self-shadow" && options.model?.includes("Sour")) {
      options.caseName = "sour-miku-black";
    }
  }

  if (!options.dataRoot) {
    throw new Error("Set MMD_DATA_ROOT or pass --data-root.");
  }
  if (!options.model) {
    throw new Error("Set MMD_SELF_SHADOW_MODEL or pass --model.");
  }
  return {
    ...options,
    dataRoot: path.resolve(options.dataRoot),
    model: normalizeAssetPath(options.dataRoot, options.model),
    motion: options.motion ? normalizeAssetPath(options.dataRoot, options.motion) : undefined
  };
}

function normalizeAssetPath(dataRoot, assetPath) {
  const normalized = assetPath.replaceAll("\\", "/");
  if (!path.isAbsolute(assetPath)) {
    return normalized;
  }
  const relative = path.relative(path.resolve(dataRoot), path.resolve(assetPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Asset path must be inside --data-root: ${assetPath}`);
  }
  return relative.replaceAll("\\", "/");
}

function createManifest(options, shadowEnabled) {
  return {
    note: "Temporary local real PMX self-shadow pair render profile.",
    render: {
      resolution: { width: 768, height: 768 },
      pixelRatio: 1,
      background: viewerLighting.background,
      lights: {
        ambient: viewerLighting.ambient,
        directional: viewerLighting.directional
      },
      ...(shadowEnabled
        ? {
            shadow: {
              enabled: true,
              directional: {
                mapSize: 4096,
                left: -2.2,
                right: 2.2,
                top: 2.8,
                bottom: -0.2,
                near: 0.02,
                far: 12,
                intensity: 1.0,
                bias: -0.00035,
                normalBias: 0.006,
                marginScale: 0.06,
                minNear: 0.02,
                minFarSpan: 2,
                maxFar: 80
              }
            }
          }
        : {})
    },
    cases: [
      {
        name: `${options.caseName}-${shadowEnabled ? "on" : "off"}`,
        model: options.model,
        ...(options.motion ? { motion: options.motion } : {}),
        timeSeconds: options.timeSeconds,
        camera: "viewer-fit"
      }
    ]
  };
}

function numberOr(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative numeric time, got: ${value}`);
  }
  return parsed;
}

async function writeComparisonImages(offPath, onPath, outputDir, caseName) {
  const [off, on] = await Promise.all([readPng(offPath), readPng(onPath)]);
  if (off.width !== on.width || off.height !== on.height) {
    throw new Error("Rendered local self-shadow pair has mismatched image sizes.");
  }

  const pair = new PNG({ width: off.width * 2, height: off.height });
  blit(off, pair, 0, 0);
  blit(on, pair, off.width, 0);
  await writePng(path.join(outputDir, `${caseName}-pair.png`), pair);

  const crop = cropRect(off.width, off.height);
  const offCrop = cropPng(off, crop);
  const onCrop = cropPng(on, crop);
  const diff = amplifiedDiff(onCrop, offCrop, 8);
  const cropSheet = new PNG({ width: crop.width * 3, height: crop.height });
  blit(offCrop, cropSheet, 0, 0);
  blit(onCrop, cropSheet, crop.width, 0);
  blit(diff, cropSheet, crop.width * 2, 0);
  await writePng(path.join(outputDir, `${caseName}-crop-diff.png`), cropSheet);

  const metrics = localSelfShadowMetrics(off, on);
  await writeFile(path.join(outputDir, `${caseName}-metrics.json`), `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(
    `  ${path.relative(repoRoot, path.join(outputDir, `${caseName}-metrics.json`))}`
  );
}

function cropRect(width, height) {
  const cropWidth = Math.round(width * 0.36);
  const cropHeight = Math.round(height * 0.36);
  return {
    x: Math.round(width * 0.325),
    y: Math.round(height * 0.29),
    width: cropWidth,
    height: cropHeight
  };
}

function localSelfShadowMetrics(off, on) {
  return {
    full: darkeningMetric(off, on, { x: 0, y: 0, width: 1, height: 1 }),
    lowerBody: darkeningMetric(off, on, { x: 0.34, y: 0.34, width: 0.32, height: 0.34 }),
    thighUnderSkirt: darkeningMetric(off, on, { x: 0.42, y: 0.5, width: 0.16, height: 0.13 })
  };
}

function darkeningMetric(off, on, roi) {
  const startX = Math.max(Math.floor(roi.x * off.width), 0);
  const startY = Math.max(Math.floor(roi.y * off.height), 0);
  const endX = Math.min(Math.ceil((roi.x + roi.width) * off.width), off.width);
  const endY = Math.min(Math.ceil((roi.y + roi.height) * off.height), off.height);
  const darkenings = [];
  let pixelCount = 0;
  let darkeningSum = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * off.width + x) * 4;
      const darkening = luminance(off, offset) - luminance(on, offset);
      if (darkening > 0) {
        darkeningSum += darkening;
        darkenings.push(darkening);
      }
      pixelCount += 1;
    }
  }
  darkenings.sort((a, b) => a - b);
  return {
    pixelCount,
    positivePixelCount: darkenings.length,
    meanDarkening: roundMetric(pixelCount > 0 ? darkeningSum / pixelCount : 0),
    p95Darkening: roundMetric(darkenings[Math.floor(darkenings.length * 0.95)] ?? 0),
    maxDarkening: roundMetric(darkenings[darkenings.length - 1] ?? 0)
  };
}

function luminance(image, offset) {
  return (
    0.2126 * (image.data[offset] ?? 0) +
    0.7152 * (image.data[offset + 1] ?? 0) +
    0.0722 * (image.data[offset + 2] ?? 0)
  ) / 255;
}

function roundMetric(value) {
  return Math.round(value * 1000000) / 1000000;
}

function cropPng(source, crop) {
  const target = new PNG({ width: crop.width, height: crop.height });
  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      copyPixel(source, crop.x + x, crop.y + y, target, x, y);
    }
  }
  return target;
}

function amplifiedDiff(a, b, gain) {
  const target = new PNG({ width: a.width, height: a.height });
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const offset = (y * a.width + x) * 4;
      target.data[offset] = Math.min(255, Math.abs(a.data[offset] - b.data[offset]) * gain);
      target.data[offset + 1] = Math.min(255, Math.abs(a.data[offset + 1] - b.data[offset + 1]) * gain);
      target.data[offset + 2] = Math.min(255, Math.abs(a.data[offset + 2] - b.data[offset + 2]) * gain);
      target.data[offset + 3] = 255;
    }
  }
  return target;
}

function blit(source, target, targetX, targetY) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      copyPixel(source, x, y, target, targetX + x, targetY + y);
    }
  }
}

function copyPixel(source, sourceX, sourceY, target, targetX, targetY) {
  const sourceOffset = (sourceY * source.width + sourceX) * 4;
  const targetOffset = (targetY * target.width + targetX) * 4;
  target.data[targetOffset] = source.data[sourceOffset];
  target.data[targetOffset + 1] = source.data[sourceOffset + 1];
  target.data[targetOffset + 2] = source.data[sourceOffset + 2];
  target.data[targetOffset + 3] = source.data[sourceOffset + 3];
}

async function readPng(filePath) {
  return PNG.sync.read(await readFile(filePath));
}

async function writePng(filePath, png) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, PNG.sync.write(png));
}

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: true
    });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptPath} exited with code ${code}`));
      }
    });
  });
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

await main();
