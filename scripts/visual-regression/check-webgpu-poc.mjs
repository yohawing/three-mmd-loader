#!/usr/bin/env node
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { browserLaunchOptions } from "./render-shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const defaultOutputDir = path.join(repoRoot, "test-results", "visual", "webgpu-poc");
const bdefSkinningModel = "/test/fixtures/generated/skinning/bdef2-two-bone-strip.pmx";
const sdefSkinningModel = "/test/fixtures/generated/skinning/sdef-two-bone-elbow.pmx";
const qdefSkinningModel = "/test/fixtures/generated/skinning/qdef-twist-cylinder.pmx";
const visualTextureModel = "/test/fixtures/generated/visual/mmd-texture-uv-orientation-plane.pmx";
const visualToonModel = "/test/fixtures/generated/visual/mmd-toon-ramp-lit-box.pmx";
const visualSphereMultiplyModel = "/test/fixtures/generated/visual/mmd-sphere-texture-multiply.pmx";
const visualAlphaCutoutModel = "/test/fixtures/generated/visual/mmd-texture-alpha-used-uv-cutout.pmx";
const visualAlphaBlendModel = "/test/fixtures/generated/visual/mmd-alpha-blend-overlap.pmx";
const visualOutlineModel = "/test/fixtures/generated/visual/mmd-outline-normal-silhouette.pmx";
const selfShadowBodyModel = "/test/fixtures/generated/self-shadow/mmd-self-shadow-body-on.pmx";
const selfShadowBlackToonModel = "/test/fixtures/generated/self-shadow/mmd-self-shadow-body-midband-black-toon-on.pmx";
const bendMotion = "/test/fixtures/generated/skinning/bend-two-bone-90.vmd";
const twistMotion = "/test/fixtures/generated/skinning/twist-four-bone-120.vmd";
const backgroundRgb = { r: 21, g: 23, b: 26 };
const mimeTypes = new Map([
  [".bmp", "image/bmp"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
  [".pmd", "application/octet-stream"],
  [".pmx", "application/octet-stream"],
  [".png", "image/png"],
  [".spa", "image/bmp"],
  [".sph", "image/bmp"],
  [".tga", "application/octet-stream"],
  [".vmd", "application/octet-stream"],
  [".wasm", "application/wasm"]
]);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(path.join(repoRoot, "dist", "three", "index.js"))) {
    throw new Error("dist/three/index.js is missing. Run npm run build before checking the WebGPU PoC.");
  }

  await mkdir(options.outputDir, { recursive: true });
  const server = await startStaticServer(options.dataRoot);
  let browser;
  try {
    const launchOptions = browserLaunchOptions();
    browser = await chromium.launch({
      ...launchOptions,
      args: ["--enable-unsafe-webgpu", ...(launchOptions.args ?? [])]
    });
    const cases = [
      { name: "forcewebgl-model", backend: "forcewebgl", scene: "model", expectedGroups: 1 },
      { name: "forcewebgl-ordering", backend: "forcewebgl", scene: "ordering", expectedGroups: 2 },
      { name: "forcewebgl-draw-index", backend: "forcewebgl", scene: "draw-index", expectedGroups: 2, expectedTint: "center-green", optional: true },
      { name: "forcewebgl-node-skinning", backend: "forcewebgl", scene: "node-skinning", expectedGroups: 1 },
      { name: "forcewebgl-node-sdef-attributes", backend: "forcewebgl", scene: "node-skinning", model: sdefSkinningModel, debug: "skinning" },
      { name: "forcewebgl-node-custom-skinning", backend: "forcewebgl", scene: "node-custom-skinning", expectedGroups: 1 },
      { name: "webgl-mmd-model-baseline", backend: "webgl", scene: "model", spin: false },
      { name: "forcewebgl-node-mmd-model", backend: "forcewebgl", scene: "node-mmd-model", spin: false },
      { name: "forcewebgl-node-mmd-outline-groups", backend: "forcewebgl", scene: "node-mmd-outline-groups", spin: false, expectedGroups: 2 },
      { name: "webgl-mmd-specular-model-baseline", backend: "webgl", scene: "model", model: bdefSkinningModel, spin: false },
      { name: "forcewebgl-node-mmd-specular-model", backend: "forcewebgl", scene: "node-mmd-model", model: bdefSkinningModel, spin: false },
      { name: "webgl-mmd-self-shadow-body-baseline", backend: "webgl", scene: "model", model: selfShadowBodyModel, spin: false, shadow: true, view: "self-shadow-body" },
      { name: "forcewebgl-node-mmd-self-shadow-body", backend: "forcewebgl", scene: "node-mmd-model", model: selfShadowBodyModel, spin: false, shadow: true, view: "self-shadow-body" },
      { name: "webgl-mmd-self-shadow-black-toon-baseline", backend: "webgl", scene: "model", model: selfShadowBlackToonModel, spin: false, shadow: true, view: "self-shadow-body" },
      { name: "forcewebgl-node-mmd-self-shadow-black-toon", backend: "forcewebgl", scene: "node-mmd-model", model: selfShadowBlackToonModel, spin: false, shadow: true, view: "self-shadow-body" },
      { name: "forcewebgl-node-mmd-self-shadow-outline-groups", backend: "forcewebgl", scene: "node-mmd-outline-groups", model: selfShadowBodyModel, spin: false, shadow: true, view: "self-shadow-body", expectedGroups: 4 },
      { name: "forcewebgl-node-mmd-alpha-outline-groups", backend: "forcewebgl", scene: "node-mmd-outline-groups", model: visualAlphaBlendModel, spin: false, expectedGroups: 4 },
      { name: "webgl-mmd-outline-baseline", backend: "webgl", scene: "model", model: visualOutlineModel, spin: false, outline: true },
      { name: "forcewebgl-node-mmd-outline-model", backend: "forcewebgl", scene: "node-mmd-outline-groups", model: visualOutlineModel, spin: false, expectedGroups: 2 },
      { name: "webgl-mmd-outline-pixelratio2-baseline", backend: "webgl", scene: "model", model: visualOutlineModel, spin: false, outline: true, pixelRatio: 2 },
      { name: "forcewebgl-node-mmd-outline-pixelratio2-model", backend: "forcewebgl", scene: "node-mmd-outline-groups", model: visualOutlineModel, spin: false, expectedGroups: 2, pixelRatio: 2 },
      { name: "webgl-mmd-texture-model-baseline", backend: "webgl", scene: "model", model: visualTextureModel, spin: false },
      { name: "forcewebgl-node-mmd-texture-model", backend: "forcewebgl", scene: "node-mmd-model", model: visualTextureModel, spin: false },
      { name: "webgl-mmd-alpha-cutout-model-baseline", backend: "webgl", scene: "model", model: visualAlphaCutoutModel, spin: false },
      { name: "forcewebgl-node-mmd-alpha-cutout-model", backend: "forcewebgl", scene: "node-mmd-model", model: visualAlphaCutoutModel, spin: false },
      { name: "webgl-mmd-alpha-blend-model-baseline", backend: "webgl", scene: "model", model: visualAlphaBlendModel, spin: false },
      { name: "forcewebgl-node-mmd-alpha-blend-model", backend: "forcewebgl", scene: "node-mmd-model", model: visualAlphaBlendModel, spin: false },
      { name: "webgl-mmd-toon-model-baseline", backend: "webgl", scene: "model", model: visualToonModel, spin: false },
      { name: "forcewebgl-node-mmd-toon-model", backend: "forcewebgl", scene: "node-mmd-model", model: visualToonModel, spin: false },
      { name: "webgl-mmd-sphere-model-baseline", backend: "webgl", scene: "model", model: visualSphereMultiplyModel, spin: false },
      { name: "forcewebgl-node-mmd-sphere-model", backend: "forcewebgl", scene: "node-mmd-model", model: visualSphereMultiplyModel, spin: false },
      { name: "webgl-bdef-baseline", backend: "webgl", scene: "model", model: bdefSkinningModel, motion: bendMotion, spin: false, flat: true },
      { name: "forcewebgl-node-bdef-skinning", backend: "forcewebgl", scene: "node-custom-skinning", model: bdefSkinningModel, motion: bendMotion, spin: false, flat: true },
      { name: "forcewebgl-node-custom-sdef-skinning", backend: "forcewebgl", scene: "node-custom-skinning", model: sdefSkinningModel },
      { name: "webgl-sdef-baseline", backend: "webgl", scene: "model", model: sdefSkinningModel, motion: bendMotion, spin: false, flat: true },
      { name: "forcewebgl-node-sdef-skinning", backend: "forcewebgl", scene: "node-sdef-skinning", model: sdefSkinningModel, motion: bendMotion, spin: false, flat: true },
      { name: "webgl-qdef-baseline", backend: "webgl", scene: "model", model: qdefSkinningModel, motion: twistMotion, spin: false, flat: true },
      { name: "forcewebgl-node-qdef-skinning", backend: "forcewebgl", scene: "node-qdef-skinning", model: qdefSkinningModel, motion: twistMotion, spin: false, flat: true },
      { name: "forcewebgl-node-slots", backend: "forcewebgl", scene: "node-slots" },
      { name: "forcewebgl-node-shadow-toon", backend: "forcewebgl", scene: "node-shadow-toon", expectedTint: "red-shadow" },
      { name: "forcewebgl-node-shadow-materials", backend: "forcewebgl", scene: "node-shadow-materials", expectedGroups: 2, expectedTint: "red-shadow" },
      { name: "forcewebgl-node-mmd-core", backend: "forcewebgl", scene: "node-mmd-core", expectedGroups: 6, expectedTint: "red-shadow" },
      { name: "forcewebgl-node-mmd-factors", backend: "forcewebgl", scene: "node-mmd-factors", expectedGroups: 6, expectedTint: "center-blue" },
      { name: "forcewebgl-node-mmd-texture", backend: "forcewebgl", scene: "node-mmd-texture", expectedGroups: 6, expectedTint: "textured" },
      { name: "forcewebgl-node-mmd-toon", backend: "forcewebgl", scene: "node-mmd-toon", expectedGroups: 6 },
      { name: "forcewebgl-node-mmd-sphere", backend: "forcewebgl", scene: "node-mmd-sphere", expectedGroups: 6, expectedTint: "center-blue" },
      { name: "forcewebgl-node-mmd-gamma", backend: "forcewebgl", scene: "node-mmd-gamma", expectedGroups: 6, expectedTint: "red-shadow" }
    ];
    const localModelUrl = options.localModel
      ? localDataUrlFor(options.dataRoot, options.localModel)
      : undefined;
    if (localModelUrl) {
      cases.push({ name: "webgl-local-real-model-baseline", backend: "webgl", scene: "model", model: localModelUrl, spin: false });
      cases.push({ name: "forcewebgl-node-local-real-model", backend: "forcewebgl", scene: "node-mmd-model", model: localModelUrl, spin: false });
    }
    if (options.includeWebgpu) {
      cases.push({
        name: "webgpu-compute-attribute",
        backend: "webgpu",
        scene: "compute-attribute",
        expectedGroups: 0,
        expectedTint: "center-green",
        expectedStatus: "rendererBackend=native-webgpu\ncompute=storage-to-attribute"
      });
      cases.push({ name: "webgpu-ordering", backend: "webgpu", scene: "ordering", expectedGroups: 2, optional: true });
      cases.push({ name: "webgpu-draw-index", backend: "webgpu", scene: "draw-index", expectedGroups: 2, expectedTint: "center-green", optional: true });
      cases.push({ name: "webgpu-node-skinning", backend: "webgpu", scene: "node-skinning", expectedGroups: 1, optional: true });
      cases.push({ name: "webgpu-node-sdef-attributes", backend: "webgpu", scene: "node-skinning", model: sdefSkinningModel, debug: "skinning", optional: true });
      cases.push({ name: "webgpu-node-custom-skinning", backend: "webgpu", scene: "node-custom-skinning", expectedGroups: 1, optional: true });
      cases.push({ name: "webgpu-node-mmd-model", backend: "webgpu", scene: "node-mmd-model", spin: false, optional: true });
      cases.push({ name: "webgpu-node-mmd-outline-groups", backend: "webgpu", scene: "node-mmd-outline-groups", spin: false, expectedGroups: 2, optional: true });
      cases.push({ name: "webgpu-node-mmd-self-shadow-outline-groups", backend: "webgpu", scene: "node-mmd-outline-groups", model: selfShadowBodyModel, spin: false, shadow: true, view: "self-shadow-body", expectedGroups: 4, optional: true });
      cases.push({ name: "webgpu-node-mmd-alpha-outline-groups", backend: "webgpu", scene: "node-mmd-outline-groups", model: visualAlphaBlendModel, spin: false, expectedGroups: 4, optional: true });
      cases.push({ name: "webgpu-node-custom-sdef-skinning", backend: "webgpu", scene: "node-custom-skinning", model: sdefSkinningModel, optional: true });
      cases.push({ name: "webgpu-node-sdef-skinning", backend: "webgpu", scene: "node-sdef-skinning", model: sdefSkinningModel, motion: bendMotion, spin: false, optional: true });
      cases.push({ name: "webgpu-node-qdef-skinning", backend: "webgpu", scene: "node-qdef-skinning", model: qdefSkinningModel, motion: twistMotion, spin: false, optional: true });
      cases.push({ name: "webgpu-node-slots", backend: "webgpu", scene: "node-slots", optional: true });
      cases.push({ name: "webgpu-node-shadow-toon", backend: "webgpu", scene: "node-shadow-toon", expectedTint: "red-shadow", optional: true });
      cases.push({ name: "webgpu-node-shadow-materials", backend: "webgpu", scene: "node-shadow-materials", expectedGroups: 2, expectedTint: "red-shadow", optional: true });
      cases.push({ name: "webgpu-node-mmd-core", backend: "webgpu", scene: "node-mmd-core", expectedGroups: 6, expectedTint: "red-shadow", optional: true });
      cases.push({ name: "webgpu-node-mmd-factors", backend: "webgpu", scene: "node-mmd-factors", expectedGroups: 6, expectedTint: "center-blue", optional: true });
      cases.push({ name: "webgpu-node-mmd-texture", backend: "webgpu", scene: "node-mmd-texture", expectedGroups: 6, expectedTint: "textured", optional: true });
      cases.push({ name: "webgpu-node-mmd-toon", backend: "webgpu", scene: "node-mmd-toon", expectedGroups: 6, optional: true });
      cases.push({ name: "webgpu-node-mmd-sphere", backend: "webgpu", scene: "node-mmd-sphere", expectedGroups: 6, expectedTint: "center-blue", optional: true });
      cases.push({ name: "webgpu-node-mmd-gamma", backend: "webgpu", scene: "node-mmd-gamma", expectedGroups: 6, expectedTint: "red-shadow", optional: true });
    }

    const results = [];
    for (const checkCase of cases) {
      results.push(await checkCaseWithBrowser(browser, server.origin, checkCase, options.outputDir));
    }

    const comparisons = await compareParityPairs(options.outputDir, [
      {
        name: "mmd-model-glsl-vs-tsl-core",
        baseline: "webgl-mmd-model-baseline",
        current: "forcewebgl-node-mmd-model",
        thresholds: { mean: 0.01, p95: 0.1, max: 0.14 }
      },
      {
        name: "mmd-texture-glsl-vs-tsl-core",
        baseline: "webgl-mmd-texture-model-baseline",
        current: "forcewebgl-node-mmd-texture-model",
        thresholds: { mean: 0.01, p95: 0.08, max: 0.12 }
      },
      {
        name: "mmd-alpha-cutout-glsl-vs-tsl-core",
        baseline: "webgl-mmd-alpha-cutout-model-baseline",
        current: "forcewebgl-node-mmd-alpha-cutout-model",
        thresholds: { mean: 0.01, p95: 0.08, max: 0.14 }
      },
      {
        name: "mmd-alpha-blend-glsl-vs-tsl-core",
        baseline: "webgl-mmd-alpha-blend-model-baseline",
        current: "forcewebgl-node-mmd-alpha-blend-model",
        thresholds: { mean: 0.015, p95: 0.1, max: 0.22 }
      },
      {
        name: "mmd-specular-glsl-vs-tsl-core",
        baseline: "webgl-mmd-specular-model-baseline",
        current: "forcewebgl-node-mmd-specular-model",
        thresholds: { mean: 0.006, p95: 0.03, max: 0.18 }
      },
      {
        name: "mmd-self-shadow-body-glsl-vs-tsl-core",
        baseline: "webgl-mmd-self-shadow-body-baseline",
        current: "forcewebgl-node-mmd-self-shadow-body",
        thresholds: { mean: 0.012, p95: 0.08, max: 0.3 }
      },
      {
        name: "mmd-self-shadow-black-toon-glsl-vs-tsl-core",
        baseline: "webgl-mmd-self-shadow-black-toon-baseline",
        current: "forcewebgl-node-mmd-self-shadow-black-toon",
        thresholds: { mean: 0.012, p95: 0.08, max: 0.35 }
      },
      {
        name: "mmd-outline-webgl-vs-tsl-groups",
        baseline: "webgl-mmd-outline-baseline",
        current: "forcewebgl-node-mmd-outline-model",
        thresholds: { mean: 0.008, p95: 0.06, max: 0.45 }
      },
      {
        name: "mmd-outline-pixelratio2-webgl-vs-tsl-groups",
        baseline: "webgl-mmd-outline-pixelratio2-baseline",
        current: "forcewebgl-node-mmd-outline-pixelratio2-model",
        thresholds: { mean: 0.004, p95: 0.02, max: 0.22 }
      },
      {
        name: "mmd-toon-glsl-vs-tsl-core",
        baseline: "webgl-mmd-toon-model-baseline",
        current: "forcewebgl-node-mmd-toon-model",
        thresholds: { mean: 0.015, p95: 0.09, max: 0.23 }
      },
      {
        name: "mmd-sphere-glsl-vs-tsl-core",
        baseline: "webgl-mmd-sphere-model-baseline",
        current: "forcewebgl-node-mmd-sphere-model",
        thresholds: { mean: 0.015, p95: 0.11, max: 0.22 }
      },
      ...(localModelUrl ? [{
        name: "local-real-model-glsl-vs-tsl-core",
        baseline: "webgl-local-real-model-baseline",
        current: "forcewebgl-node-local-real-model"
      }] : []),
      { name: "sdef-baseline-vs-tsl", baseline: "webgl-sdef-baseline", current: "forcewebgl-node-sdef-skinning" },
      { name: "bdef-baseline-vs-tsl", baseline: "webgl-bdef-baseline", current: "forcewebgl-node-bdef-skinning" },
      { name: "qdef-baseline-vs-tsl", baseline: "webgl-qdef-baseline", current: "forcewebgl-node-qdef-skinning" }
    ]);
    const report = {
      generatedAt: new Date().toISOString(),
      results,
      comparisons
    };
    await writeFile(path.join(options.outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

    const failed = results.filter(result => !result.pass && !result.optional);
    const failedComparisons = comparisons.filter(comparison => comparison.pass === false);
    for (const result of results) {
      const verdict = result.pass ? "PASS" : result.optional ? "INFO" : "FAIL";
      console.log(`${verdict} ${result.name}: ${result.statusSummary}`);
    }
    for (const comparison of comparisons) {
      const verdict = comparison.pass === false ? "FAIL" : comparison.thresholds ? "PASS" : "INFO";
      console.log(
        `${verdict} ${comparison.name}: mean=${formatMetric(comparison.mean)} ` +
          `p95=${formatMetric(comparison.p95)} p99=${formatMetric(comparison.p99)} max=${formatMetric(comparison.max)} ` +
          `gt10=${formatMetric(comparison.ratioGt10)} gt25=${formatMetric(comparison.ratioGt25)} ` +
          `maxAt=${comparison.maxAt.x},${comparison.maxAt.y}`
      );
    }
    if (failed.length > 0 || failedComparisons.length > 0) {
      throw new Error(
        `${failed.length} WebGPU PoC check(s) and ${failedComparisons.length} comparison(s) failed.`
      );
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function checkCaseWithBrowser(browser, origin, checkCase, outputDir) {
  const page = await browser.newPage({
    viewport: { width: 960, height: 720 },
    deviceScaleFactor: 1
  });
  const messages = [];
  page.on("pageerror", error => {
    messages.push({ type: "pageerror", text: error.message });
  });
  page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") {
      messages.push({ type: message.type(), text: message.text() });
    }
  });

  try {
    const modelParam = checkCase.model ? `&model=${encodeURIComponent(checkCase.model)}` : "";
    const motionParam = checkCase.motion ? `&motion=${encodeURIComponent(checkCase.motion)}` : "";
    const spinParam = checkCase.spin === false ? "&spin=0" : "";
    const debugParam = checkCase.debug ? `&debug=${encodeURIComponent(checkCase.debug)}` : "";
    const flatParam = checkCase.flat === true ? "&flat=1" : "";
    const shadowParam = checkCase.shadow === true ? "&shadow=1" : "";
    const outlineParam = checkCase.outline === true ? "&outline=1" : "";
    const pixelRatioParam = checkCase.pixelRatio ? `&pixelRatio=${encodeURIComponent(checkCase.pixelRatio)}` : "";
    const viewParam = checkCase.view ? `&view=${encodeURIComponent(checkCase.view)}` : "";
    const pagePath = checkCase.backend === "webgl"
      ? "/examples/webgpu-poc/webgl-baseline.html"
      : "/examples/webgpu-poc/";
    const url = `${origin}${pagePath}?backend=${checkCase.backend}&scene=${checkCase.scene}${modelParam}${motionParam}${spinParam}${debugParam}${flatParam}${shadowParam}${outlineParam}${pixelRatioParam}${viewParam}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        'document.querySelector("#status")?.textContent?.includes("ready")',
        null,
        { timeout: 20000 }
      );
    } catch (error) {
      const status = await page.locator("#status").textContent().catch(() => "<missing status>");
      throw new Error(
        `${checkCase.name} did not become ready: ${error instanceof Error ? error.message : String(error)} ` +
          `status=${status} messages=${JSON.stringify(messages)}`
      );
    }
    await page.waitForTimeout(300);
    const status = await page.locator("#status").textContent();
    await page.locator("#status").evaluate(element => {
      element.style.visibility = "hidden";
    });
    const screenshot = await page.locator("canvas").screenshot();
    await writeFile(path.join(outputDir, `${checkCase.name}.png`), screenshot);
    const stats = analyzePng(PNG.sync.read(screenshot));
    const statusSummary = status.replace(/\n/g, " | ");
    const statusPass = status.includes("ready") &&
      status.includes(`scene=${checkCase.scene}`) &&
      (checkCase.expectedStatus === undefined || status.includes(checkCase.expectedStatus)) &&
      (checkCase.expectedGroups === undefined || status.includes(`groups=${checkCase.expectedGroups}`));
    const imagePass = stats.variedSamples > 100;
    const orderingPass = checkCase.scene !== "ordering" || stats.center.g > stats.center.r + 6;
    const tintPass =
      (checkCase.expectedTint !== "red-shadow" || stats.redDominantSamples > 20) &&
      (checkCase.expectedTint !== "center-green" || stats.center.g > stats.center.r + 24) &&
      (checkCase.expectedTint !== "center-blue" || stats.center.b > stats.center.r + 24) &&
      (checkCase.expectedTint !== "center-purple" || (stats.center.b > stats.center.g + 18 && stats.center.r > stats.center.g - 4)) &&
      (checkCase.expectedTint !== "textured" || stats.colorSpreadSamples > 20);
    const errorMessages = messages.filter(message => message.type === "error" || message.type === "pageerror");

    return {
      name: checkCase.name,
      optional: checkCase.optional === true,
      pass: statusPass && imagePass && orderingPass && tintPass && errorMessages.length === 0,
      status,
      statusSummary,
      stats,
      messages
    };
  } finally {
    await page.close();
  }
}

async function compareParityPairs(outputDir, pairs) {
  const comparisons = [];
  for (const pair of pairs) {
    const baselinePath = path.join(outputDir, `${pair.baseline}.png`);
    const currentPath = path.join(outputDir, `${pair.current}.png`);
    if (!existsSync(baselinePath) || !existsSync(currentPath)) {
      continue;
    }
    const metrics = await comparePng(
      PNG.sync.read(await readFile(baselinePath)),
      PNG.sync.read(await readFile(currentPath)),
      path.join(outputDir, `${pair.name}.diff.png`)
    );
    const failures = [];
    if (pair.thresholds) {
      if (metrics.mean > pair.thresholds.mean) {
        failures.push(`mean ${formatMetric(metrics.mean)} > ${formatMetric(pair.thresholds.mean)}`);
      }
      if (metrics.p95 > pair.thresholds.p95) {
        failures.push(`p95 ${formatMetric(metrics.p95)} > ${formatMetric(pair.thresholds.p95)}`);
      }
      if (pair.thresholds.p99 !== undefined && metrics.p99 > pair.thresholds.p99) {
        failures.push(`p99 ${formatMetric(metrics.p99)} > ${formatMetric(pair.thresholds.p99)}`);
      }
      if (pair.thresholds.ratioGt10 !== undefined && metrics.ratioGt10 > pair.thresholds.ratioGt10) {
        failures.push(`gt10 ${formatMetric(metrics.ratioGt10)} > ${formatMetric(pair.thresholds.ratioGt10)}`);
      }
      if (pair.thresholds.ratioGt25 !== undefined && metrics.ratioGt25 > pair.thresholds.ratioGt25) {
        failures.push(`gt25 ${formatMetric(metrics.ratioGt25)} > ${formatMetric(pair.thresholds.ratioGt25)}`);
      }
      if (pair.thresholds.max !== undefined && metrics.max > pair.thresholds.max) {
        failures.push(`max ${formatMetric(metrics.max)} > ${formatMetric(pair.thresholds.max)}`);
      }
    }
    comparisons.push({
      name: pair.name,
      baseline: pair.baseline,
      current: pair.current,
      thresholds: pair.thresholds,
      pass: pair.thresholds ? failures.length === 0 : undefined,
      failures,
      ...metrics
    });
  }
  return comparisons;
}

async function comparePng(baseline, current, diffPath) {
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new Error(`Cannot compare PNGs with different sizes: ${baseline.width}x${baseline.height} vs ${current.width}x${current.height}`);
  }
  const distances = [];
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  let sum = 0;
  let max = 0;
  let maxAt = { x: 0, y: 0 };
  let gt10 = 0;
  let gt25 = 0;
  for (let y = 0; y < baseline.height; y += 1) {
    for (let x = 0; x < baseline.width; x += 1) {
      const index = (baseline.width * y + x) * 4;
      const dr = (baseline.data[index] - current.data[index]) / 255;
      const dg = (baseline.data[index + 1] - current.data[index + 1]) / 255;
      const db = (baseline.data[index + 2] - current.data[index + 2]) / 255;
      const distance = Math.sqrt((dr * dr + dg * dg + db * db) / 3);
      distances.push(distance);
      sum += distance;
      if (distance > 0.1) {
        gt10 += 1;
      }
      if (distance > 0.25) {
        gt25 += 1;
      }
      if (distance > max) {
        max = distance;
        maxAt = { x, y };
      }
      writeDiffPixel(diff, index, distance);
    }
  }
  distances.sort((a, b) => a - b);
  await writeFile(diffPath, PNG.sync.write(diff));
  return {
    mean: roundMetric(sum / distances.length),
    p95: roundMetric(distances[Math.min(distances.length - 1, Math.ceil(distances.length * 0.95) - 1)]),
    p99: roundMetric(distances[Math.min(distances.length - 1, Math.ceil(distances.length * 0.99) - 1)]),
    ratioGt10: roundMetric(gt10 / distances.length),
    ratioGt25: roundMetric(gt25 / distances.length),
    max: roundMetric(max),
    maxAt
  };
}

function writeDiffPixel(diff, index, distance) {
  const value = Math.min(255, Math.round(distance * 255 * 4));
  diff.data[index] = value;
  diff.data[index + 1] = Math.max(0, value - 96);
  diff.data[index + 2] = 0;
  diff.data[index + 3] = 255;
}

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function formatMetric(value) {
  return value.toFixed(6);
}

function analyzePng(png) {
  let variedSamples = 0;
  let redDominantSamples = 0;
  let colorSpreadSamples = 0;
  for (let y = 0; y < png.height; y += 8) {
    for (let x = 0; x < png.width; x += 8) {
      const rgb = readRgb(png, x, y);
      if (
        Math.abs(rgb.r - backgroundRgb.r) > 3 ||
        Math.abs(rgb.g - backgroundRgb.g) > 3 ||
        Math.abs(rgb.b - backgroundRgb.b) > 3
      ) {
        variedSamples += 1;
      }
      if (rgb.r > rgb.g + 24 && rgb.r > rgb.b + 24) {
        redDominantSamples += 1;
      }
      if (Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) > 80) {
        colorSpreadSamples += 1;
      }
    }
  }
  return {
    width: png.width,
    height: png.height,
    variedSamples,
    redDominantSamples,
    colorSpreadSamples,
    center: readRgb(png, Math.floor(png.width / 2), Math.floor(png.height / 2))
  };
}

function readRgb(png, x, y) {
  const index = (png.width * y + x) * 4;
  return {
    r: png.data[index],
    g: png.data[index + 1],
    b: png.data[index + 2]
  };
}

async function startStaticServer(dataRoot) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const filePath = resolveRequestPath(url.pathname, dataRoot);
      if (filePath === undefined) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const info = await stat(filePath);
      const resolvedFilePath = info.isDirectory() ? path.join(filePath, "index.html") : filePath;
      const contentType = mimeTypes.get(path.extname(resolvedFilePath)) ?? "application/octet-stream";
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentType
      });
      createReadStream(resolvedFilePath).pipe(response);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      response.writeHead(code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end(code === "ENOENT" ? "Not found" : "Internal server error");
    }
  });

  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Failed to allocate a local port."));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close(error => error ? closeReject(error) : closeResolve());
        })
      });
    });
  });
}

function resolveRequestPath(pathname, dataRoot) {
  if (pathname.startsWith("/__mmd_data__/")) {
    if (!dataRoot) {
      return undefined;
    }
    const relativeDataPath = decodeURIComponent(pathname.slice("/__mmd_data__/".length));
    const dataFilePath = path.resolve(dataRoot, relativeDataPath);
    return isPathInside(dataFilePath, dataRoot) ? dataFilePath : undefined;
  }
  const normalized = path.normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  const filePath = path.resolve(repoRoot, normalized === "" ? "examples/webgpu-poc/index.html" : normalized);
  if (!isPathInside(filePath, repoRoot)) {
    return undefined;
  }
  return filePath.endsWith(path.sep) ? path.join(filePath, "index.html") : filePath;
}

function isPathInside(filePath, parentPath) {
  const relative = path.relative(parentPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseArgs(args) {
  const options = {
    includeWebgpu: false,
    outputDir: defaultOutputDir,
    dataRoot: undefined,
    localModel: undefined
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--include-webgpu") {
      options.includeWebgpu = true;
    } else if (arg === "--output-dir") {
      options.outputDir = path.resolve(requireValue(args, (index += 1), arg));
    } else if (arg === "--data-root") {
      options.dataRoot = path.resolve(requireValue(args, (index += 1), arg));
    } else if (arg === "--local-model") {
      options.localModel = requireValue(args, (index += 1), arg).replaceAll("\\", "/");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.localModel && !options.dataRoot) {
    throw new Error("--local-model requires --data-root.");
  }
  if (options.localModel) {
    const modelPath = path.resolve(options.dataRoot, options.localModel);
    if (!isPathInside(modelPath, options.dataRoot)) {
      throw new Error(`--local-model must stay inside --data-root: ${options.localModel}`);
    }
    if (!existsSync(modelPath)) {
      throw new Error(`--local-model does not exist: ${modelPath}`);
    }
  }
  return options;
}

function localDataUrlFor(dataRoot, relativePath) {
  const modelPath = path.resolve(dataRoot, relativePath);
  const normalizedRelativePath = path.relative(dataRoot, modelPath).split(path.sep).map(encodeURIComponent).join("/");
  return `/__mmd_data__/${normalizedRelativePath}`;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

await main();
