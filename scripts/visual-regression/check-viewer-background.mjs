#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import {
  browserLaunchOptions,
  commonWebMimeTypes,
  isPathInside,
  peekArgValue,
  startStaticServer
} from "./render-shared.mjs";
import { round } from "./pixel-metrics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const fixturePath = "test/fixtures/generated/visual/mmd-viewer-background-room.pmx";
const defaultOutputDir = path.join(repoRoot, "test-results", "visual", "viewer-background");
const syntheticRois = {
  wall: { x: 64, y: 142, width: 155, height: 70 },
  floor: { x: 80, y: 550, width: 220, height: 44 },
  blackProp: { x: 435, y: 420, width: 90, height: 100 }
};
const syntheticRoiThresholds = {
  minimumColorfulRatio: 0.75,
  minimumNonBlackRatio: 0.98,
  maximumBlackPropMean: 12,
  minimumBlackPropRatio: 0.95,
  maximumRoiMeanRgbDelta: 30
};
const mimeTypes = commonWebMimeTypes;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(path.join(repoRoot, "dist", "three", "index.js"))) {
    throw new Error("dist/three/index.js is missing. Run npm run build before the viewer background gate.");
  }
  if (!options.localBackground && !existsSync(path.join(repoRoot, fixturePath))) {
    throw new Error(`Synthetic background fixture is missing: ${fixturePath}`);
  }
  await mkdir(options.outputDir, { recursive: true });
  const dataRoot = options.localBackground ? path.dirname(options.localBackground) : undefined;
  const server = await startStaticServer(pathname => resolveRequestPath(pathname, dataRoot), mimeTypes);
  let browser;
  const report = { fixture: options.localBackground ?? fixturePath, passed: false, cases: [], thresholds: { minimumColorfulSamples: 24, maxMeanRgbDelta: 92 } };
  try {
    const launchOptions = browserLaunchOptions();
    browser = await chromium.launch({ ...launchOptions, args: ["--enable-unsafe-webgpu", ...(launchOptions.args ?? [])] });
    const backgroundUrl = options.localBackground
      ? `/__mmd_data__/${encodeURIComponent(path.basename(options.localBackground))}`
      : `/${fixturePath}`;
    const baseline = await loadAndCapture(browser, server.origin, backgroundUrl, "baseline-webgl", options.outputDir);
    report.cases.push(serializableCase(baseline));
    const native = await switchToNativeAndCapture(baseline.page, baseline.pageErrorListener, options.outputDir);
    report.cases.push(serializableCase(native));
    const parity = comparePng(baseline.png, native.png);
    report.parity = parity;
    const visualPass = native.stats.colorfulSamples >= report.thresholds.minimumColorfulSamples && parity.meanRgbDelta <= report.thresholds.maxMeanRgbDelta;
    const nativePass = native.observation.nativeWebgpu && native.observation.tslMaterials && native.observation.diffuseTexturesResolved && native.observation.shadowCasters > 0 && !native.observation.characterRegistered;
    const syntheticRoi = options.localBackground ? undefined : analyzeSyntheticRois(baseline.png, native.png);
    const syntheticTextureResolution = options.localBackground ? undefined : {
      expectedResolvedDiffuseTextureCount: 2,
      actualResolvedDiffuseTextureCount: native.observation.resolvedDiffuseTextureCount,
      pass: native.observation.resolvedDiffuseTextureCount === 2
    };
    if (syntheticRoi) {
      report.syntheticRoi = syntheticRoi;
    }
    if (syntheticTextureResolution) {
      report.syntheticTextureResolution = syntheticTextureResolution;
    }
    const dispose = await clearAndObserve(native.page, native.observation.shadowCasterIds);
    report.dispose = dispose;
    report.passed = baseline.pass && native.pass && nativePass && visualPass && (syntheticRoi?.pass ?? true) && (syntheticTextureResolution?.pass ?? true) && dispose.pass;
    await native.page.close();
    if (!report.passed) {
      throw new Error(`viewer background gate failed: ${JSON.stringify({ baseline: serializableCase(baseline), native: serializableCase(native), parity, syntheticRoi, syntheticTextureResolution, dispose })}`);
    }
  } finally {
    await writeFile(path.join(options.outputDir, "report.json"), JSON.stringify(report, null, 2));
    await browser?.close();
    await server.close();
  }
}

function serializableCase(result) {
  return { name: result.name, pass: result.pass, stats: result.stats, observation: result.observation, messages: result.messages, imagePath: `${result.name}.png` };
}

async function loadAndCapture(browser, origin, backgroundUrl, name, outputDir) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  const messages = [];
  const pageErrorListener = error => messages.push(error.message);
  page.on("pageerror", pageErrorListener);
  await page.goto(`${origin}/examples/viewer/?backend=baseline`, { waitUntil: "domcontentloaded" });
  await waitForViewer(page, "baseline viewer");
  const loaded = await page.evaluate(async (url) => globalThis.mmdViewer.loadBackgroundUrl(url), backgroundUrl);
  if (!loaded) throw new Error("Baseline background URL load returned false.");
  await page.waitForTimeout(400);
  const observation = await observeBackground(page);
  const png = PNG.sync.read(await page.locator("canvas").screenshot());
  await writeFile(path.join(outputDir, `${name}.png`), PNG.sync.write(png));
  return { name, page, png, stats: analyzePng(png), observation, messages, pageErrorListener, pass: observation.backgroundPresent && !observation.characterRegistered && messages.length === 0 };
}

async function switchToNativeAndCapture(page, baselinePageErrorListener, outputDir) {
  // Keep baseline and native page errors independent. The same page is reused
  // for the backend switch, so leaving the baseline listener attached would
  // retroactively turn a clean baseline case red when native initialization
  // reports an error.
  page.off("pageerror", baselinePageErrorListener);
  const messages = [];
  page.on("pageerror", error => messages.push(error.message));
  const switcher = page.locator("#pipeline-backend-switcher");
  await switcher.evaluate((element) => {
    element.value = "webgpu";
    element.dispatchEvent(new element.ownerDocument.defaultView.CustomEvent("sl-change", { bubbles: true }));
  });
  await page.waitForURL(url => new URL(url).searchParams.get("backend") === "webgpu", { timeout: 15000 });
  await waitForViewer(page, "native WebGPU viewer");
  await page.waitForFunction(() => Boolean(globalThis.mmdViewer.currentBackground), null, { timeout: 20000 });
  await page.waitForTimeout(700);
  const observation = await observeBackground(page);
  const png = PNG.sync.read(await page.locator("canvas").screenshot());
  await writeFile(path.join(outputDir, "native-webgpu.png"), PNG.sync.write(png));
  return { name: "native-webgpu", page, png, stats: analyzePng(png), observation, messages, pass: observation.backgroundPresent && observation.nativeWebgpu && messages.length === 0 };
}

async function waitForViewer(page, label) {
  await page.waitForFunction(() => Boolean(globalThis.mmdViewer?.renderer && globalThis.mmdViewer?.scene), null, { timeout: 20000 }).catch(async error => {
    const status = await page.locator("#status").textContent().catch(() => "<missing>");
    throw new Error(`${label} did not initialize: ${error.message}; status=${status}`);
  });
}

async function observeBackground(page) {
  return await page.evaluate(() => {
    const viewer = globalThis.mmdViewer;
    const background = viewer.currentBackground;
    const materials = Array.isArray(background?.mesh?.material) ? background.mesh.material : [background?.mesh?.material].filter(Boolean);
    const shadowCasters = [];
    background?.root?.traverse?.((object) => {
      if (object.userData?.mmdTslShadowCaster) shadowCasters.push(object.uuid);
    });
    globalThis.__viewerBackgroundGate = { shadowCasterIds: shadowCasters };
    return {
      backgroundPresent: Boolean(background?.root),
      nativeWebgpu: viewer.renderer?.backend?.isWebGPUBackend === true,
      tslMaterials: materials.length > 0 && materials.every(material => Boolean(material?.userData?.mmdTslMaterialUniforms)),
      diffuseTexturesResolved: materials.filter(material => !material?.userData?.mmdTslOutlineMaterial).some(material => Boolean(material?.userData?.mmdTslSourceDiffuseTexture?.image)),
      resolvedDiffuseTextureCount: materials.filter(material => Boolean(material?.userData?.mmdTslSourceDiffuseTexture?.image)).length,
      shadowCasters: shadowCasters.length,
      shadowCasterIds: shadowCasters,
      characterRegistered: Boolean(viewer.currentModel)
    };
  });
}

async function clearAndObserve(page, oldShadowCasterIds) {
  return await page.evaluate((ids) => {
    const previous = globalThis.mmdViewer.currentBackground;
    const clear = globalThis.document.querySelector("#clear-background");
    clear?.dispatchEvent(new globalThis.MouseEvent("click", { bubbles: true }));
    const remaining = [];
    previous?.root?.traverse?.((object) => {
      if (object.userData?.mmdTslShadowCaster) remaining.push(object.uuid);
    });
    return { pass: !globalThis.mmdViewer.currentBackground && ids.length > 0 && remaining.length === 0, oldCasterCount: ids.length, remainingCasterCount: remaining.length };
  }, oldShadowCasterIds);
}

function analyzePng(png) {
  let colorfulSamples = 0;
  for (let y = 0; y < png.height; y += 8) for (let x = 0; x < png.width; x += 8) {
    const index = (y * png.width + x) * 4;
    const r = png.data[index], g = png.data[index + 1], b = png.data[index + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 45 && Math.max(r, g, b) > 80) colorfulSamples += 1;
  }
  return { width: png.width, height: png.height, colorfulSamples };
}

function analyzeSyntheticRois(baseline, native) {
  const baselineStats = Object.fromEntries(Object.entries(syntheticRois).map(([name, roi]) => [name, analyzeRoi(baseline, roi)]));
  const nativeStats = Object.fromEntries(Object.entries(syntheticRois).map(([name, roi]) => [name, analyzeRoi(native, roi)]));
  const deltas = Object.fromEntries(Object.entries(syntheticRois).map(([name, roi]) => [name, compareRoi(baseline, native, roi)]));
  const coloredRegionsPass = ["wall", "floor"].every(name =>
    baselineStats[name].colorfulRatio >= syntheticRoiThresholds.minimumColorfulRatio &&
    nativeStats[name].colorfulRatio >= syntheticRoiThresholds.minimumColorfulRatio &&
    baselineStats[name].nonBlackRatio >= syntheticRoiThresholds.minimumNonBlackRatio &&
    nativeStats[name].nonBlackRatio >= syntheticRoiThresholds.minimumNonBlackRatio &&
    deltas[name].meanRgbDelta <= syntheticRoiThresholds.maximumRoiMeanRgbDelta
  );
  const blackPropPass = [baselineStats.blackProp, nativeStats.blackProp].every(stats =>
    stats.meanRgb <= syntheticRoiThresholds.maximumBlackPropMean && stats.blackRatio >= syntheticRoiThresholds.minimumBlackPropRatio
  ) && deltas.blackProp.meanRgbDelta <= syntheticRoiThresholds.maximumRoiMeanRgbDelta;
  return { rois: syntheticRois, thresholds: syntheticRoiThresholds, baseline: baselineStats, native: nativeStats, deltas, pass: coloredRegionsPass && blackPropPass };
}

function analyzeRoi(png, roi) {
  let colorful = 0, nonBlack = 0, black = 0, sum = 0, samples = 0;
  for (let y = roi.y; y < roi.y + roi.height; y += 1) for (let x = roi.x; x < roi.x + roi.width; x += 1) {
    const index = (y * png.width + x) * 4;
    const r = png.data[index], g = png.data[index + 1], b = png.data[index + 2];
    const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
    if (maximum - minimum > 45 && maximum > 80) colorful += 1;
    if (maximum >= 20) nonBlack += 1;
    if (maximum < 20) black += 1;
    sum += (r + g + b) / 3;
    samples += 1;
  }
  return { samples, colorfulRatio: roundRatio(colorful / samples), nonBlackRatio: roundRatio(nonBlack / samples), blackRatio: roundRatio(black / samples), meanRgb: roundRatio(sum / samples) };
}

function compareRoi(a, b, roi) {
  let sum = 0;
  for (let y = roi.y; y < roi.y + roi.height; y += 1) for (let x = roi.x; x < roi.x + roi.width; x += 1) {
    const index = (y * a.width + x) * 4;
    sum += (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2])) / 3;
  }
  return { meanRgbDelta: roundRatio(sum / (roi.width * roi.height)) };
}

function roundRatio(value) { return round(value); }

function comparePng(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error("Background captures have different dimensions.");
  let sum = 0;
  for (let index = 0; index < a.data.length; index += 4) sum += (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2])) / 3;
  return { meanRgbDelta: round(sum / (a.width * a.height)) };
}

function resolveRequestPath(pathname, dataRoot) {
  if (pathname.startsWith("/__mmd_data__/")) {
    const candidate = path.resolve(dataRoot ?? "", decodeURIComponent(pathname.slice(14)));
    return dataRoot && isPathInside(candidate, dataRoot) ? candidate : undefined;
  }
  const candidate = path.resolve(repoRoot, path.normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "") || "examples/viewer/index.html");
  return isPathInside(candidate, repoRoot) ? candidate : undefined;
}

function parseArgs(args) {
  const options = { outputDir: defaultOutputDir, localBackground: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]; const value = peekArgValue(args, index);
    if (arg === "--output-dir" && value) { options.outputDir = path.resolve(value); index += 1; }
    else if (arg === "--local-background" && value) { options.localBackground = path.resolve(value); index += 1; }
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (options.localBackground && !existsSync(options.localBackground)) throw new Error(`--local-background does not exist: ${options.localBackground}`);
  return options;
}

await main();
