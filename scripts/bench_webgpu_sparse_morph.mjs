#!/usr/bin/env node
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

import { browserLaunchOptions } from "./visual-regression/render-shared.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");
const mimeTypes = new Map([
  [".bmp", "image/bmp"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
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
    throw new Error("dist/three/index.js is missing. Run npm run build before benchmarking.");
  }

  const server = await startStaticServer(options.dataRoot);
  let browser;
  try {
    const launchOptions = browserLaunchOptions();
    browser = await chromium.launch({
      ...launchOptions,
      args: ["--enable-unsafe-webgpu", ...(launchOptions.args ?? [])]
    });
    const dense = await runMode(browser, server.origin, options, "dense");
    const sparse = await runMode(browser, server.origin, options, "sparse");
    const report = {
      generatedAt: new Date().toISOString(),
      timingScope: {
        cpuFrameWorkMs: "CPU submission work from animation update through renderer.render; it does not wait for GPU completion.",
        rafIntervalMs: "requestAnimationFrame cadence; it includes browser scheduling and may include GPU backpressure, but is not a GPU timestamp."
      },
      model: options.model,
      motion: options.motion,
      warmupFrames: options.warmupFrames,
      sampleFrames: options.sampleFrames,
      dense,
      sparse,
      sparseToDenseRatio: {
        cpuFrameWorkP50: ratio(sparse.cpuFrameWorkMs.p50, dense.cpuFrameWorkMs.p50),
        cpuFrameWorkP95: ratio(sparse.cpuFrameWorkMs.p95, dense.cpuFrameWorkMs.p95),
        rafIntervalP50: ratio(sparse.rafIntervalMs.p50, dense.rafIntervalMs.p50),
        rafIntervalP95: ratio(sparse.rafIntervalMs.p95, dense.rafIntervalMs.p95)
      }
    };
    printReport(report);
    if (options.output) {
      await mkdir(path.dirname(options.output), { recursive: true });
      await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Wrote ${options.output}`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function runMode(browser, origin, options, mode) {
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const messages = [];
  page.on("pageerror", error => messages.push(error.message));
  try {
    const model = localDataUrlFor(options.dataRoot, options.model);
    const motion = localDataUrlFor(options.dataRoot, options.motion);
    const url = `${origin}/examples/webgpu-poc/?backend=webgpu&scene=node-mmd-model&spin=0&model=${encodeURIComponent(model)}&motion=${encodeURIComponent(motion)}&benchmark=${mode}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      'document.querySelector("#status")?.textContent?.includes("ready")',
      undefined,
      { timeout: 30000 }
    );
    const status = await page.locator("#status").textContent();
    if (!status?.includes("rendererBackend=native-webgpu")) {
      throw new Error(`native WebGPU is unavailable for ${mode}: ${status ?? "missing status"}`);
    }
    const result = await page.evaluate(async ({ warmupFrames, sampleFrames }) => {
      // This callback runs in the browser page, not the Node.js benchmark process.
      // eslint-disable-next-line no-undef
      const hook = window.__threeMmdWebgpuPocBenchmark;
      if (!hook) throw new Error("WebGPU PoC benchmark hook is unavailable");
      return await hook.start({ warmupFrames, sampleFrames });
    }, options);
    if (messages.length > 0) {
      throw new Error(`${mode} benchmark emitted page errors: ${messages.join(" | ")}`);
    }
    if (result.cpuFrameWorkMs.count < options.sampleFrames || result.rafIntervalMs.count < options.sampleFrames - 1) {
      throw new Error(`${mode} benchmark collected insufficient frames`);
    }
    return result;
  } finally {
    await context.close();
  }
}

function parseArgs(args) {
  const options = { dataRoot: undefined, model: undefined, motion: undefined, warmupFrames: 60, sampleFrames: 240, output: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--data-root") options.dataRoot = path.resolve(requireValue(args, ++index, arg));
    else if (arg === "--model") options.model = normalizeRelativePath(requireValue(args, ++index, arg), arg);
    else if (arg === "--motion") options.motion = normalizeRelativePath(requireValue(args, ++index, arg), arg);
    else if (arg === "--warmup-frames") options.warmupFrames = parseFrameCount(requireValue(args, ++index, arg), arg, 0);
    else if (arg === "--sample-frames") options.sampleFrames = parseFrameCount(requireValue(args, ++index, arg), arg, 2);
    else if (arg === "--output") options.output = path.resolve(requireValue(args, ++index, arg));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.dataRoot || !options.model || !options.motion) {
    throw new Error("--data-root, --model, and --motion are required.");
  }
  for (const relativePath of [options.model, options.motion]) {
    const filePath = path.resolve(options.dataRoot, relativePath);
    if (!isPathInside(filePath, options.dataRoot) || !existsSync(filePath)) {
      throw new Error(`Local benchmark asset is unavailable inside --data-root: ${relativePath}`);
    }
  }
  return options;
}

function normalizeRelativePath(value, flag) {
  if (path.isAbsolute(value) || value.split(/[\\/]+/).includes("..")) {
    throw new Error(`${flag} must be a path relative to --data-root: ${value}`);
  }
  return value.replaceAll("\\", "/");
}

function parseFrameCount(value, flag, minimum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${flag} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function localDataUrlFor(dataRoot, relativePath) {
  return `/__mmd_data__/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}

function printReport(report) {
  console.log("Native WebGPU sparse morph benchmark (milliseconds; CPU submission and rAF cadence, not GPU completion)");
  for (const mode of ["dense", "sparse"]) {
    const result = report[mode];
    console.log(`${mode}: cpu p50=${result.cpuFrameWorkMs.p50.toFixed(3)} p95=${result.cpuFrameWorkMs.p95.toFixed(3)} | rAF p50=${result.rafIntervalMs.p50.toFixed(3)} p95=${result.rafIntervalMs.p95.toFixed(3)} | morphs=${result.metadata.morphCount}`);
  }
  console.log(`sparse/dense: cpu p50=${report.sparseToDenseRatio.cpuFrameWorkP50} p95=${report.sparseToDenseRatio.cpuFrameWorkP95} | rAF p50=${report.sparseToDenseRatio.rafIntervalP50} p95=${report.sparseToDenseRatio.rafIntervalP95}`);
}

async function startStaticServer(dataRoot) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const filePath = resolveRequestPath(url.pathname, dataRoot);
      if (!filePath) return response.writeHead(403).end("Forbidden");
      const info = await stat(filePath);
      const resolvedPath = info.isDirectory() ? path.join(filePath, "index.html") : filePath;
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": mimeTypes.get(path.extname(resolvedPath)) ?? "application/octet-stream" });
      createReadStream(resolvedPath).pipe(response);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      response.writeHead(code === "ENOENT" ? 404 : 500).end(code === "ENOENT" ? "Not found" : "Internal server error");
    }
  });
  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") return reject(new Error("Failed to allocate a local port."));
      resolve({ origin: `http://127.0.0.1:${address.port}`, close: () => new Promise((done, fail) => server.close(error => error ? fail(error) : done())) });
    });
  });
}

function resolveRequestPath(pathname, dataRoot) {
  if (pathname.startsWith("/__mmd_data__/")) {
    const relativePath = decodeURIComponent(pathname.slice("/__mmd_data__/".length));
    const filePath = path.resolve(dataRoot, relativePath);
    return isPathInside(filePath, dataRoot) ? filePath : undefined;
  }
  const normalized = path.normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  const filePath = path.resolve(repoRoot, normalized === "" ? "examples/webgpu-poc/index.html" : normalized);
  return isPathInside(filePath, repoRoot) ? filePath : undefined;
}

function isPathInside(filePath, parentPath) {
  const relative = path.relative(parentPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

await main();
