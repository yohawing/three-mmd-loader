#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { browserLaunchOptions, sha256File } from "./render-shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(__dirname, "generated-pmx.manifest.json");
const defaultOutputDir = path.join(repoRoot, "test-results", "visual", "generated-pmx-webgpu", "current");
const supportedBackends = new Set(["forcewebgl", "webgpu"]);

const mimeTypes = new Map([
  [".bmp", "image/bmp"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
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
    throw new Error("dist/three/index.js is missing. Run npm run build before rendering WebGPU visuals.");
  }
  if (!existsSync(path.join(repoRoot, "dist", "webgpu", "index.js"))) {
    throw new Error("dist/webgpu/index.js is missing. Run npm run build before rendering WebGPU visuals.");
  }

  const manifest = JSON.parse(await readFile(options.manifestPath, "utf8"));
  validateManifest(manifest);
  const selectedCases = selectCases(manifest.cases, options.caseName);
  const resolvedCases = selectedCases.map(resolveCase);

  await mkdir(options.outputDir, { recursive: true });
  const server = await startStaticServer();
  let browser;
  try {
    const launchOptions = browserLaunchOptions();
    browser = await chromium.launch({
      ...launchOptions,
      args: ["--enable-unsafe-webgpu", ...(launchOptions.args ?? [])]
    });
    const page = await browser.newPage({
      viewport: manifest.render.resolution,
      deviceScaleFactor: manifest.render.pixelRatio
    });
    page.on("console", message => {
      if (message.type() === "warning" || message.type() === "error") {
        console.warn(message.text());
      }
    });
    await page.goto(`${server.origin}/__generated_pmx_webgpu_renderer__`, { waitUntil: "networkidle" });
    const hashes = [];
    for (const visualCase of resolvedCases) {
      const renderedCase = await page.evaluate(async config => {
        return await globalThis.renderGeneratedPmxWebgpuVisualCase(config);
      }, {
        backend: options.backend,
        render: manifest.render,
        visualCase
      });
      const screenshot = await page.locator("canvas").screenshot();
      const filePath = path.join(options.outputDir, `${renderedCase.name}.png`);
      await writeFile(filePath, screenshot);
      hashes.push({ name: renderedCase.name, sha256: await sha256File(filePath) });
      await page.evaluate(() => {
        globalThis.disposeGeneratedPmxWebgpuScene?.();
      });
    }
    await page.evaluate(() => {
      globalThis.disposeGeneratedPmxWebgpuRenderer?.();
    });
    console.log(
      `Rendered ${hashes.length} generated-PMX WebGPU visual case(s) to ${path.relative(repoRoot, options.outputDir)}`
    );
    for (const hash of hashes) {
      console.log(`${hash.sha256}  ${hash.name}.png`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

function validateManifest(manifest) {
  if (!manifest.render?.resolution || manifest.render.pixelRatio === undefined) {
    throw new Error("generated-pmx manifest must include render.resolution and render.pixelRatio");
  }
  if (!Array.isArray(manifest.cases)) {
    throw new Error("generated-pmx manifest must include cases");
  }
}

function selectCases(cases, caseName) {
  if (caseName === undefined) {
    return cases;
  }
  const selected = cases.filter(visualCase => visualCase.name === caseName);
  if (selected.length === 0) {
    throw new Error(`Unknown generated-pmx visual case: ${caseName}`);
  }
  return selected;
}

function resolveCase(visualCase) {
  const modelPath = path.resolve(repoRoot, visualCase.model);
  if (!isInsideRoot(modelPath, repoRoot) || !existsSync(modelPath)) {
    throw new Error(`Missing generated PMX model for ${visualCase.name}: ${visualCase.model}`);
  }
  return {
    ...visualCase,
    timeSeconds: visualCase.timeSeconds ?? 0,
    modelUrl: `/${path.relative(repoRoot, modelPath).split(path.sep).map(encodeURIComponent).join("/")}`
  };
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/__generated_pmx_webgpu_renderer__") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(rendererHtml());
      return;
    }
    if (requestUrl.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    const filePath = resolveRequestPath(requestUrl.pathname);
    if (filePath === undefined) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream"
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

function resolveRequestPath(requestPath) {
  const normalizedPath = path.normalize(decodeURIComponent(requestPath)).replace(/^[/\\]+/, "");
  const filePath = path.resolve(repoRoot, normalizedPath);
  return isInsideRoot(filePath, repoRoot) ? filePath : undefined;
}

function isInsideRoot(filePath, root) {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function rendererHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>generated PMX WebGPU visual renderer</title>
    <script type="importmap">
      {
        "imports": {
          "three": "/node_modules/three/build/three.webgpu.js",
          "three/webgpu": "/node_modules/three/build/three.webgpu.js",
          "three/tsl": "/node_modules/three/build/three.tsl.js"
        }
      }
    </script>
  </head>
  <body>
    <script type="module">
      import * as THREE from "three/webgpu";
      import { ThreeMmdLoader } from "/dist/three/index.js";
      import { replaceMmdModelMaterialsWithTsl } from "/dist/webgpu/index.js";

      let renderer;
      let lastScene;

      globalThis.renderGeneratedPmxWebgpuVisualCase = async config => {
        renderer ??= await createRenderer(config);
        globalThis.disposeGeneratedPmxWebgpuScene();

        const visualCase = config.visualCase;
        const scene = buildScene(config.render);
        const loader = new ThreeMmdLoader({
          textureResolver: createCaseTextureResolver(visualCase.modelUrl),
          // The WebGL baseline enables outlines, which also enables geometry-aware alpha
          // classification while loading. TSL appends its own outline groups, so request
          // the same alpha classification explicitly instead of relying on that side effect.
          geometryAwareAlpha: true,
          runtime: { physics: "none" }
        });
        const model = await loader.loadModel(visualCase.modelUrl, {
          outline: false,
          materialRenderOrder: false,
          morphSplit: false,
          frustumCulled: false
        });
        model.update(visualCase.timeSeconds, { physics: false });
        replaceMmdModelMaterialsWithTsl(model.mesh, {
          appendOutlineGroups: true,
          respectMaterialShadowFlags: true,
          // Pair with LinearSRGBColorSpace below for legacy WebGL gamma-space
          // framebuffer blending parity against the generated-PMX WebGL baseline.
          legacySrgbFramebuffer: true
        });
        // The WebGL generated-PMX baseline only synchronizes MMD material light uniforms
        // for light-VMD cases. This profile has static scene lights, so preserve the MMD
        // material defaults here instead of injecting the host directional light.
        model.root.updateMatrixWorld(true);
        scene.add(model.root);
        const camera = createCamera(visualCase.camera, model.root, config.render.resolution);
        await renderFrame(renderer, scene, camera);
        await new Promise(requestAnimationFrame);
        await renderFrame(renderer, scene, camera);
        await new Promise(requestAnimationFrame);
        lastScene = scene;

        return { name: visualCase.name };
      };

      globalThis.disposeGeneratedPmxWebgpuScene = () => {
        if (lastScene === undefined) {
          return;
        }
        disposeScene(lastScene);
        lastScene = undefined;
      };

      globalThis.disposeGeneratedPmxWebgpuRenderer = () => {
        globalThis.disposeGeneratedPmxWebgpuScene();
        renderer?.dispose();
        renderer?.domElement.remove();
        renderer = undefined;
      };

      async function createRenderer(config) {
        const createdRenderer = new THREE.WebGPURenderer({
          antialias: false,
          alpha: false,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
          forceWebGL: config.backend === "forcewebgl"
        });
        createdRenderer.setSize(config.render.resolution.width, config.render.resolution.height, false);
        createdRenderer.setPixelRatio(config.render.pixelRatio);
        createdRenderer.setClearColor(config.render.background, 1);
        // LinearSRGB + legacySrgbFramebuffer materials: blend in gamma space like
        // the legacy WebGL MMD framebuffer (no material EOTF before the framebuffer).
        createdRenderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        createdRenderer.toneMapping = THREE.NoToneMapping;
        await createdRenderer.init();
        document.body.append(createdRenderer.domElement);
        return createdRenderer;
      }

      function renderFrame(activeRenderer, scene, camera) {
        activeRenderer.render(scene, camera);
      }

      function buildScene(render) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(render.background);
        const ambient = render.lights.ambient;
        scene.add(new THREE.AmbientLight(ambient.color, ambient.intensity));
        const directional = render.lights.directional;
        const light = new THREE.DirectionalLight(directional.color, directional.intensity);
        light.position.fromArray(directional.position);
        scene.add(light);
        scene.add(light.target);
        scene.userData.mmdDirectionalLight = light;
        return scene;
      }

      function createCaseTextureResolver(modelUrl) {
        return {
          async resolve(texturePath) {
            return new URL(normalizeTexturePath(texturePath), new URL(".", new URL(modelUrl, location.href))).toString();
          }
        };
      }

      function normalizeTexturePath(texturePath) {
        return texturePath.replaceAll("\\\\", "/").replace(/^\\.\\/+/u, "");
      }

      function createCamera(cameraConfig, mesh, resolution) {
        const box = new THREE.Box3().setFromObject(mesh);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const radius = Math.max(sphere.radius, 1);
        if (cameraConfig === "front-fit") {
          const aspect = resolution.width / resolution.height;
          const halfHeight = radius * 1.18;
          const halfWidth = halfHeight * aspect;
          const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, radius * 10 + 100);
          camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + radius * 3);
          camera.lookAt(sphere.center);
          camera.updateProjectionMatrix();
          return camera;
        }
        if (cameraConfig === "viewer-fit") {
          const camera = new THREE.PerspectiveCamera(22, resolution.width / resolution.height, Math.max(radius / 100, 0.01), Math.max(radius * 40, 100));
          camera.position.copy(sphere.center).add(new THREE.Vector3(0, radius * 0.15, radius * 5.2));
          camera.lookAt(sphere.center);
          camera.updateProjectionMatrix();
          return camera;
        }
        const camera = new THREE.PerspectiveCamera(cameraConfig.fov, resolution.width / resolution.height, cameraConfig.near ?? 0.1, cameraConfig.far ?? radius * 10 + 100);
        camera.position.fromArray(cameraConfig.position);
        camera.lookAt(...cameraConfig.target);
        camera.updateProjectionMatrix();
        return camera;
      }

      function disposeScene(scene) {
        scene.traverse(object => {
          object.geometry?.dispose?.();
          const material = object.material;
          if (Array.isArray(material)) {
            material.forEach(disposeMaterial);
          } else if (material) {
            disposeMaterial(material);
          }
        });
      }

      function disposeMaterial(material) {
        for (const value of Object.values(material)) {
          if (value && typeof value === "object" && "isTexture" in value) {
            value.dispose();
          }
        }
        material.dispose();
      }
    </script>
  </body>
</html>`;
}

function parseArgs(args) {
  const options = {
    backend: "forcewebgl",
    caseName: undefined,
    manifestPath,
    outputDir: defaultOutputDir
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--backend") {
      const backend = requireValue(args, index += 1, arg);
      if (!supportedBackends.has(backend)) {
        throw new Error(`--backend must be one of: ${Array.from(supportedBackends).join(", ")}`);
      }
      options.backend = backend;
    } else if (arg === "--case") {
      options.caseName = requireValue(args, index += 1, arg);
    } else if (arg === "--manifest") {
      options.manifestPath = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--output-dir") {
      options.outputDir = path.resolve(requireValue(args, index += 1, arg));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

await main();
