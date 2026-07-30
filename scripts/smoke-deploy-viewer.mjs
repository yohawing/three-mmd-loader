#!/usr/bin/env node
/* global document, fetch */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "@playwright/test";

import { browserLaunchOptions, isPathInside } from "./visual-regression/render-shared.mjs";

const root = resolve(import.meta.dirname, "..");
const deployRoot = resolve(root, "deploy");
const fixturePath = resolve(root, "test/fixtures/generated/visual/mmd-viewer-self-shadow-receiver.pmx");
const fixtureRoute = "/__viewer_deploy_smoke__.pmx";
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const distRoute = `/dist-v${packageJson.version}`;
const wasmRoute = `/__mmd_anim_wasm-v${packageJson.version}`;

if (!existsSync(resolve(deployRoot, "index.html"))) {
  throw new Error("deploy/index.html is missing. Run node scripts/build-deploy.mjs first.");
}
if (!existsSync(fixturePath)) {
  throw new Error("Generated Viewer smoke fixture is missing.");
}

const server = await startServer();
let browser;
try {
  browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${server.origin}/?backend=baseline&debug&physics=0`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForFunction(() =>
    globalThis.mmdViewer?.renderer && globalThis.mmdViewer?.runtimeStatus
  );
  const loaded = await page.evaluate(async (url) => globalThis.mmdViewer.loadModelUrl(url), fixtureRoute);
  const result = await page.evaluate(async ({ version, dist, wasm }) => {
    const assetPaths = [
      `${dist}/worker/entry.js`,
      `${dist}/physics/mmd/mmd_bullet.worker.mjs`,
      `${dist}/physics/mmd/mmd_bullet.worker.wasm`,
      `${wasm}/mmd_anim_wasm.js`,
      `${wasm}/mmd_anim_wasm_bg.wasm`
    ];
    const assets = [];
    for (const path of assetPaths) {
      const response = await fetch(path);
      assets.push({
        path,
        ok: response.ok,
        contentType: response.headers.get("content-type")
      });
    }
    return {
      version,
      displayedVersion: document.querySelector("#app-version")?.textContent,
      runtime: globalThis.mmdViewer.runtimeStatus,
      runtimeErrorHidden: document.querySelector("#runtime-error")?.hidden,
      assets
    };
  }, { version: packageJson.version, dist: distRoute, wasm: wasmRoute });
  const invalidAsset = result.assets.find((asset) =>
    !asset.ok ||
    (asset.path.endsWith(".wasm")
      ? asset.contentType !== "application/wasm"
      : !asset.contentType?.startsWith("text/javascript"))
  );
  if (
    !loaded ||
    result.displayedVersion !== packageJson.version ||
    result.runtime.requested !== "worker" ||
    result.runtime.active !== "worker" ||
    result.runtime.transport !== "transferable" ||
    result.runtime.readiness !== "ready" ||
    result.runtime.fallbackCount !== 0 ||
    result.runtimeErrorHidden !== true ||
    invalidAsset ||
    pageErrors.length > 0
  ) {
    throw new Error(`Deploy Viewer smoke failed: ${JSON.stringify({ loaded, result, invalidAsset, pageErrors })}`);
  }
  process.stdout.write(`${JSON.stringify({ passed: true, ...result }, null, 2)}\n`);
} finally {
  await browser?.close();
  await server.close();
}

async function startServer() {
  const mimeTypes = new Map([
    [".bmp", "image/bmp"],
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".pmx", "application/octet-stream"],
    [".png", "image/png"],
    [".wasm", "application/wasm"]
  ]);
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const candidate = pathname === fixtureRoute
        ? fixturePath
        : resolve(deployRoot, decodeURIComponent(pathname).replace(/^[/\\]+/, "") || "index.html");
      if (candidate !== fixturePath && !isPathInside(candidate, deployRoot)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const info = await stat(candidate);
      const filePath = info.isDirectory() ? resolve(candidate, "index.html") : candidate;
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream"
      });
      response.end(await readFile(filePath));
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });
  return await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate deploy smoke server port."));
        return;
      }
      resolvePromise({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close(error => error ? fail(error) : done()))
      });
    });
  });
}
