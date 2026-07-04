#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { browserLaunchOptions, sha256File } from "./render-shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(__dirname, "real-models.manifest.json");
const visualRoot = path.join(repoRoot, "test-results", "visual", "real-models");
const supportedModes = new Set(["current", "baseline"]);
const dataRootEnvName = "MMD_DATA_ROOT";

const mimeTypes = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".html", "text/html; charset=utf-8"],
  [".pmx", "application/octet-stream"],
  [".pmd", "application/octet-stream"],
  [".vmd", "application/octet-stream"],
  [".vpd", "text/plain; charset=utf-8"],
  [".bmp", "image/bmp"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".tga", "application/octet-stream"],
  [".sph", "image/bmp"],
  [".spa", "image/bmp"]
]);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dataRoot = options.dataRoot ?? process.env[dataRootEnvName];
  if (!dataRoot) {
    console.log(`Local real-model profile skipped: ${dataRootEnvName} is not set and --data-root was not provided.`);
    return;
  }

  const resolvedDataRoot = path.resolve(dataRoot);
  if (!existsSync(resolvedDataRoot)) {
    console.log(`Local real-model profile skipped: ${dataRootEnvName} does not exist: ${resolvedDataRoot}`);
    return;
  }

  if (!existsSync(path.join(repoRoot, "dist", "three", "index.js"))) {
    throw new Error("dist/three/index.js is missing. Run npm run build before rendering real-model visuals.");
  }

  const manifest = await loadManifest(options.manifestPath);
  const selectedCases = selectCases(manifest.cases, options.caseName);
  const resolvedCases = resolveCases(selectedCases, resolvedDataRoot);
  if (resolvedCases.length === 0) {
    console.log("Local real-model profile skipped: no renderable cases after asset checks.");
    return;
  }

  const outputDir = options.outputDir ?? path.join(visualRoot, options.mode);
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.join(visualRoot, "diff"), { recursive: true });

  const server = await startStaticServer(resolvedDataRoot);
  let browser;

  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({
      viewport: manifest.render.resolution,
      deviceScaleFactor: manifest.render.pixelRatio
    });

    page.on("console", message => {
      if (message.type() === "warning") {
        console.warn(message.text());
      }
    });

    await page.goto(`${server.origin}/__real_model_visual_renderer__`, {
      waitUntil: "networkidle"
    });

    const renderedCases = await page.evaluate(async config => {
      return await globalThis.renderRealModelVisualRegressionCases(config);
    }, {
      render: manifest.render,
      cases: resolvedCases
    });

    for (const renderedCase of renderedCases) {
      const buffer = Buffer.from(renderedCase.base64Png, "base64");
      const filePath = path.join(outputDir, `${renderedCase.name}.png`);
      await writeFile(filePath, buffer);
    }

    const hashes = [];
    for (const renderedCase of renderedCases) {
      const filePath = path.join(outputDir, `${renderedCase.name}.png`);
      hashes.push({ name: renderedCase.name, sha256: await sha256File(filePath) });
    }

    console.log(`Rendered ${hashes.length} real-model visual ${options.mode} case(s) to ${path.relative(repoRoot, outputDir)}`);
    for (const hash of hashes) {
      console.log(`${hash.sha256}  ${hash.name}.png`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

function parseArgs(args) {
  const options = { mode: "current", caseName: undefined, outputDir: undefined, manifestPath, dataRoot: undefined };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--mode") {
      const mode = args[index + 1];
      if (mode === undefined || !supportedModes.has(mode)) {
        throw new Error(`--mode must be one of: ${Array.from(supportedModes).join(", ")}`);
      }
      options.mode = mode;
      index += 1;
      continue;
    }

    if (arg === "--case") {
      options.caseName = requireRawValue(args, (index += 1), arg);
      continue;
    }

    if (arg === "--manifest") {
      options.manifestPath = path.resolve(requireRawValue(args, (index += 1), arg));
      continue;
    }

    if (arg === "--data-root") {
      options.dataRoot = path.resolve(requireRawValue(args, (index += 1), arg));
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = path.resolve(requireRawValue(args, (index += 1), arg));
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.outputDir !== undefined) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
    options.outputDir = path.resolve(arg);
  }

  return options;
}

function requireRawValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

async function loadManifest(filePath) {
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  validateManifest(manifest);
  return manifest;
}

function validateManifest(manifest) {
  if (!Array.isArray(manifest.cases)) {
    throw new Error("Real-model manifest must include a cases array");
  }
  if (!manifest.render?.resolution || manifest.render.pixelRatio === undefined) {
    throw new Error("Real-model manifest must include render.resolution and render.pixelRatio");
  }

  const names = new Set();
  for (const visualCase of manifest.cases) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(visualCase.name)) {
      throw new Error(`Real-model case name must be kebab-case: ${visualCase.name}`);
    }
    if (names.has(visualCase.name)) {
      throw new Error(`Duplicate real-model case name: ${visualCase.name}`);
    }
    names.add(visualCase.name);
    if (typeof visualCase.model !== "string" || visualCase.model.length === 0) {
      throw new Error(`Real-model case ${visualCase.name} must define model`);
    }
    if (visualCase.motion !== undefined && typeof visualCase.motion !== "string") {
      throw new Error(`Real-model case ${visualCase.name} motion must be a string when present`);
    }
    if (visualCase.cameraVmd !== undefined && typeof visualCase.cameraVmd !== "string") {
      throw new Error(`Real-model case ${visualCase.name} cameraVmd must be a string when present`);
    }
    if (visualCase.lightVmd !== undefined && typeof visualCase.lightVmd !== "string") {
      throw new Error(`Real-model case ${visualCase.name} lightVmd must be a string when present`);
    }
    if (visualCase.timeSeconds !== undefined && (!Number.isFinite(visualCase.timeSeconds) || visualCase.timeSeconds < 0)) {
      throw new Error(`Real-model case ${visualCase.name} timeSeconds must be a non-negative number`);
    }
    if (!isValidCamera(visualCase.camera)) {
      throw new Error(`Real-model case ${visualCase.name} must define camera as "front-fit", "viewer-fit", or a camera config object`);
    }
  }
}

function isValidCamera(camera) {
  if (camera === "front-fit" || camera === "viewer-fit") {
    return true;
  }
  return Boolean(
    camera &&
      typeof camera === "object" &&
      Array.isArray(camera.position) &&
      Array.isArray(camera.target) &&
      Number.isFinite(camera.fov)
  );
}

function selectCases(cases, caseName) {
  if (caseName === undefined) {
    return cases;
  }

  const selected = cases.filter(visualCase => visualCase.name === caseName);
  if (selected.length === 0) {
    throw new Error(`Unknown real-model visual case: ${caseName}`);
  }
  return selected;
}

function resolveCases(cases, dataRoot) {
  const resolvedCases = [];
  for (const visualCase of cases) {
    const modelPath = resolveAssetPath(dataRoot, visualCase.model);
    if (modelPath === undefined || !existsSync(modelPath)) {
      console.warn(`Skipping real-model case ${visualCase.name}: model not found: ${visualCase.model}`);
      continue;
    }

    let motionPath;
    if (visualCase.motion !== undefined) {
      motionPath = resolveAssetPath(dataRoot, visualCase.motion);
      if (motionPath === undefined || !existsSync(motionPath)) {
        console.warn(`Skipping real-model case ${visualCase.name}: motion not found: ${visualCase.motion}`);
        continue;
      }
    }
    let cameraVmdPath;
    if (visualCase.cameraVmd !== undefined) {
      cameraVmdPath = resolveAssetPath(dataRoot, visualCase.cameraVmd);
      if (cameraVmdPath === undefined || !existsSync(cameraVmdPath)) {
        console.warn(`Skipping real-model case ${visualCase.name}: camera VMD not found: ${visualCase.cameraVmd}`);
        continue;
      }
    }
    let lightVmdPath;
    if (visualCase.lightVmd !== undefined) {
      lightVmdPath = resolveAssetPath(dataRoot, visualCase.lightVmd);
      if (lightVmdPath === undefined || !existsSync(lightVmdPath)) {
        console.warn(`Skipping real-model case ${visualCase.name}: light VMD not found: ${visualCase.lightVmd}`);
        continue;
      }
    }

    resolvedCases.push({
      ...visualCase,
      timeSeconds: visualCase.timeSeconds ?? 0,
      modelUrl: dataUrlFor(dataRoot, modelPath),
      motionUrl: motionPath === undefined ? undefined : dataUrlFor(dataRoot, motionPath),
      cameraVmdUrl: cameraVmdPath === undefined ? undefined : dataUrlFor(dataRoot, cameraVmdPath),
      lightVmdUrl: lightVmdPath === undefined ? undefined : dataUrlFor(dataRoot, lightVmdPath)
    });
  }
  return resolvedCases;
}

function resolveAssetPath(dataRoot, relativePath) {
  if (path.isAbsolute(relativePath)) {
    return undefined;
  }
  const resolved = path.resolve(dataRoot, relativePath);
  return isInsideRoot(resolved, dataRoot) ? resolved : undefined;
}

function dataUrlFor(dataRoot, filePath) {
  return `/__mmd_data__/${path.relative(dataRoot, filePath).split(path.sep).map(encodeURIComponent).join("/")}`;
}

async function startStaticServer(dataRoot) {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/__real_model_visual_renderer__") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(rendererHtml());
      return;
    }

    const filePath = resolveRequestPath(requestUrl.pathname, dataRoot);
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

function resolveRequestPath(requestPath, dataRoot) {
  const dataPrefix = "/__mmd_data__/";
  if (requestPath.startsWith(dataPrefix)) {
    const relativePath = decodePath(requestPath.slice(dataPrefix.length));
    const filePath = path.resolve(dataRoot, relativePath);
    return isInsideRoot(filePath, dataRoot) ? filePath : undefined;
  }

  const normalizedPath = decodePath(requestPath).replace(/^[/\\]+/, "");
  const filePath = path.resolve(repoRoot, normalizedPath);
  return isInsideRoot(filePath, repoRoot) ? filePath : undefined;
}

function decodePath(requestPath) {
  return path.normalize(decodeURIComponent(requestPath));
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
    <title>three-mmd-loader real-model visual renderer</title>
    <script type="importmap">
      {
        "imports": {
          "three": "/node_modules/three/build/three.module.js"
        }
      }
    </script>
  </head>
  <body>
    <script type="module">
      import * as THREE from "three";
      import {
        ThreeMmdLoader,
        applyMmdCameraStateToThreeCamera,
        applyMmdLightStateToThreeDirectionalLight,
        applyMmdSelfShadowStateToThreeDirectionalLight,
        configureMmdSelfShadowDirectionalLight,
        fitMmdSelfShadowDirectionalLightToBox,
        syncMmdSpecularDirection
      } from "/dist/three/index.js";
      import { sampleMmdCameraTrack, sampleMmdLightTrack, sampleMmdSelfShadowTrack } from "/dist/runtime/index.js";

      globalThis.renderRealModelVisualRegressionCases = async config => {
        const renderer = new THREE.WebGLRenderer({
          antialias: false,
          alpha: false,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance"
        });
        renderer.setSize(config.render.resolution.width, config.render.resolution.height, false);
        renderer.setPixelRatio(config.render.pixelRatio);
        renderer.setClearColor(config.render.background, 1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NoToneMapping;
        if (config.render.shadow?.enabled === true) {
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.BasicShadowMap;
        }
        document.body.append(renderer.domElement);

        const results = [];
        for (const visualCase of config.cases) {
          const scene = buildScene(config.render);
          const loader = new ThreeMmdLoader({
            textureResolver: createCaseTextureResolver(visualCase.modelUrl),
            runtime: { physics: "none" }
          });
          const model = await loader.loadModel(await fetchBytes(visualCase.modelUrl));
          if (model.diagnostics.textures.length > 0) {
            for (const diagnostic of model.diagnostics.textures) {
              console.warn("Real-model texture diagnostic " + visualCase.name + ": " + diagnostic.code + " " + diagnostic.path);
            }
          }
          scene.add(model.root);

          let selfShadowState;
          let vmdCamera;
          if (visualCase.motionUrl !== undefined) {
            const { animation } = await loader.loadAnimation(await fetchBytes(visualCase.motionUrl));
            model.setAnimation(animation);
            model.update(visualCase.timeSeconds, { physics: false });
            if (config.render.shadow?.enabled === true) {
              selfShadowState = sampleMmdSelfShadowTrack(animation.selfShadowFrames, visualCase.timeSeconds * 30);
            }
          } else {
            model.update(visualCase.timeSeconds, { physics: false });
          }

          model.root.updateMatrixWorld(true);
          if (visualCase.lightVmdUrl !== undefined) {
            const { animation } = await loader.loadAnimation(await fetchBytes(visualCase.lightVmdUrl));
            const lightState = sampleMmdLightTrack(
              animation.lightFrames,
              (visualCase.lightVmdTimeSeconds ?? visualCase.timeSeconds) * 30
            );
            applyMmdLightStateToThreeDirectionalLight(scene.userData.mmdDirectionalLight, lightState, {
              target: model.root.position
            });
            if (model.mesh?.material) {
              syncMmdSpecularDirection(model.mesh.material, scene.userData.mmdDirectionalLight);
            }
          }
          if (config.render.shadow?.enabled === true) {
            const shadowBounds = new THREE.Box3().setFromObject(model.root);
            fitMmdSelfShadowDirectionalLightToBox(scene.userData.mmdDirectionalLight, shadowBounds, {
              marginScale: config.render.shadow.directional?.marginScale ?? 0.06,
              minNear: config.render.shadow.directional?.minNear ?? 0.02,
              minFarSpan: config.render.shadow.directional?.minFarSpan ?? 2,
              maxFar: config.render.shadow.directional?.maxFar ?? 80
            });
            applyMmdSelfShadowStateToThreeDirectionalLight(scene.userData.mmdDirectionalLight, selfShadowState, {
              distanceScale: 100,
              minFar: 1,
              maxFar: 20,
              shadowIntensity: config.render.shadow.directional?.intensity ?? 0.55
            });
          }
          if (visualCase.cameraVmdUrl !== undefined) {
            const { animation } = await loader.loadAnimation(await fetchBytes(visualCase.cameraVmdUrl));
            const cameraState = sampleMmdCameraTrack(
              animation.cameraFrames,
              (visualCase.cameraVmdTimeSeconds ?? visualCase.timeSeconds) * 30
            );
            if (cameraState !== undefined) {
              vmdCamera = new THREE.PerspectiveCamera(45, config.render.resolution.width / config.render.resolution.height, 0.1, 1000);
              applyMmdCameraStateToThreeCamera(vmdCamera, cameraState, {
                aspect: config.render.resolution.width / config.render.resolution.height
              });
            }
          }
          const camera = vmdCamera ?? createCamera(visualCase.camera, model.root, config.render.resolution);
          renderer.render(scene, camera);
          await new Promise(requestAnimationFrame);
          results.push({
            name: visualCase.name,
            base64Png: renderer.domElement.toDataURL("image/png").split(",")[1]
          });

          disposeScene(scene);
        }

        renderer.dispose();
        renderer.domElement.remove();
        return results;
      };

      function buildScene(render) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(render.background);

        const ambient = render.lights.ambient;
        scene.add(new THREE.AmbientLight(ambient.color, ambient.intensity));

        const directional = render.lights.directional;
        const light = new THREE.DirectionalLight(directional.color, directional.intensity);
        light.position.fromArray(directional.position);
        if (render.shadow?.enabled === true) {
          light.castShadow = true;
          const shadow = render.shadow.directional ?? {};
          configureMmdSelfShadowDirectionalLight(light, {
            mapSize: shadow.mapSize ?? 1024,
            bias: shadow.bias ?? -0.0005,
            normalBias: shadow.normalBias ?? 0.01,
            shadowIntensity: shadow.intensity ?? 0.55,
            cameraLeft: shadow.left ?? -2,
            cameraRight: shadow.right ?? 2,
            cameraTop: shadow.top ?? 2,
            cameraBottom: shadow.bottom ?? -2,
            cameraNear: shadow.near ?? 0.1,
            cameraFar: shadow.far ?? 10
          });
          light.target.position.fromArray(directional.target ?? [0, 0, 0]);
          scene.add(light.target);
        }
        scene.add(light);
        scene.userData.mmdDirectionalLight = light;

        return scene;
      }

      async function fetchBytes(url) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Failed to fetch local visual asset: " + url + " (" + response.status + ")");
        }
        return new Uint8Array(await response.arrayBuffer());
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
          if (object.geometry) {
            object.geometry.dispose();
          }
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

await main();
