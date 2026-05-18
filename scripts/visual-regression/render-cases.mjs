import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { browserLaunchOptions, sha256File } from "./render-shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(__dirname, "cases.manifest.json");
const visualRoot = path.join(repoRoot, "test-results", "visual");
const supportedModes = new Set(["current", "baseline"]);

const mimeTypes = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".html", "text/html; charset=utf-8"]
]);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await loadManifest();
  const selectedCases = selectCases(manifest.cases, options.caseId);
  const outputDir = options.outputDir ?? path.join(visualRoot, options.mode);

  await mkdir(outputDir, { recursive: true });
  await mkdir(path.join(visualRoot, "diff"), { recursive: true });

  const server = await startStaticServer();
  let browser;

  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({
      viewport: manifest.render.resolution,
      deviceScaleFactor: manifest.render.pixelRatio
    });

    await page.goto(`${server.origin}/__visual_regression_renderer__`, {
      waitUntil: "networkidle"
    });

    const renderConfig = {
      ...manifest.render,
      cases: selectedCases
    };
    const renderedCases = await page.evaluate(async config => {
      return await globalThis.renderVisualRegressionCases(config);
    }, renderConfig);

    for (const renderedCase of renderedCases) {
      const buffer = Buffer.from(renderedCase.base64Png, "base64");
      const filePath = path.join(outputDir, `${renderedCase.id}.png`);
      await writeFile(filePath, buffer);
    }

    const hashes = [];
    for (const visualCase of selectedCases) {
      const filePath = path.join(outputDir, `${visualCase.id}.png`);
      hashes.push({ id: visualCase.id, sha256: await sha256File(filePath) });
    }

    console.log(`Rendered ${hashes.length} visual ${options.mode} case(s) to ${path.relative(repoRoot, outputDir)}`);
    for (const hash of hashes) {
      console.log(`${hash.sha256}  ${hash.id}.png`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

function parseArgs(args) {
  const options = { mode: "current", caseId: undefined, outputDir: undefined };

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
      const caseId = args[index + 1];
      if (caseId === undefined || caseId.startsWith("--")) {
        throw new Error("--case requires a case id");
      }
      options.caseId = caseId;
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      const outputDir = args[index + 1];
      if (outputDir === undefined || outputDir.startsWith("--")) {
        throw new Error("--output-dir requires a path");
      }
      options.outputDir = path.resolve(outputDir);
      index += 1;
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

async function loadManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateManifest(manifest);
  return manifest;
}

function validateManifest(manifest) {
  if (!manifest.note?.includes("regression detection only")) {
    throw new Error("Manifest note must describe the baseline policy as regression detection only");
  }

  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    throw new Error("Manifest must contain at least one visual case");
  }

  const ids = new Set();
  for (const visualCase of manifest.cases) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(visualCase.id)) {
      throw new Error(`Visual case id must be kebab-case: ${visualCase.id}`);
    }
    if (ids.has(visualCase.id)) {
      throw new Error(`Duplicate visual case id: ${visualCase.id}`);
    }
    ids.add(visualCase.id);
  }
}

function selectCases(cases, caseId) {
  if (caseId === undefined) {
    return cases;
  }

  const visualCase = cases.find(candidate => candidate.id === caseId);
  if (visualCase === undefined) {
    throw new Error(`Unknown visual case: ${caseId}`);
  }
  return [visualCase];
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/__visual_regression_renderer__") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(rendererHtml());
      return;
    }

    const normalizedPath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^[/\\]+/, "");
    const filePath = path.resolve(repoRoot, normalizedPath);

    if (!filePath.startsWith(repoRoot + path.sep)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": mimeTypes.get(path.extname(filePath)) ?? "application/octet-stream"
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

function rendererHtml() {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>three-mmd-loader visual renderer</title></head>
  <body>
    <script type="module">
      import * as THREE from "/node_modules/three/build/three.module.js";

      const toLinear = value => new THREE.Color(value).convertSRGBToLinear();

      globalThis.renderVisualRegressionCases = async config => {
        const renderer = new THREE.WebGLRenderer({
          antialias: false,
          alpha: false,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance"
        });
        renderer.setSize(config.resolution.width, config.resolution.height, false);
        renderer.setPixelRatio(config.pixelRatio);
        renderer.setClearColor(config.background, 1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NoToneMapping;
        document.body.append(renderer.domElement);

        const camera = new THREE.OrthographicCamera(
          config.camera.left,
          config.camera.right,
          config.camera.top,
          config.camera.bottom,
          config.camera.near,
          config.camera.far
        );
        camera.position.fromArray(config.camera.position);
        camera.lookAt(...config.camera.target);
        camera.updateProjectionMatrix();

        const results = [];
        for (const visualCase of config.cases) {
          const scene = buildScene(config);
          buildCase(visualCase, scene);
          renderer.render(scene, camera);
          await new Promise(requestAnimationFrame);
          results.push({
            id: visualCase.id,
            base64Png: renderer.domElement.toDataURL("image/png").split(",")[1]
          });
        }

        renderer.dispose();
        renderer.domElement.remove();
        return results;
      };

      function buildScene(config) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(config.background);

        const ambient = config.lights.ambient;
        scene.add(new THREE.AmbientLight(ambient.color, ambient.intensity));

        const directional = config.lights.directional;
        const light = new THREE.DirectionalLight(directional.color, directional.intensity);
        light.position.fromArray(directional.position);
        scene.add(light);

        return scene;
      }

      function buildCase(visualCase, scene) {
        const material = visualCase.material;
        const geometry = createGeometry(visualCase.geometry);

        if (material.kind === "standard") {
          scene.add(new THREE.Mesh(geometry, standardMaterial(material)));
          return;
        }

        if (material.kind === "toon") {
          scene.add(new THREE.Mesh(geometry, toonMaterial(material)));
          return;
        }

        if (material.kind === "sphere-texture") {
          scene.add(new THREE.Mesh(geometry, sphereTextureMaterial(material)));
          return;
        }

        if (material.kind === "overlap-blend") {
          addOverlapPlanes(scene, geometry, material, false);
          return;
        }

        if (material.kind === "overlap-render-order") {
          addOverlapPlanes(scene, geometry, material, true);
          return;
        }

        if (material.kind === "outline") {
          addOutlineSphere(scene, visualCase.geometry, material);
          return;
        }

        throw new Error("Unknown visual material kind: " + material.kind);
      }

      function createGeometry(geometry) {
        if (geometry.kind === "sphere") {
          return new THREE.SphereGeometry(geometry.radius, geometry.widthSegments, geometry.heightSegments);
        }
        if (geometry.kind === "plane" || geometry.kind === "overlap-planes") {
          return new THREE.PlaneGeometry(geometry.width, geometry.height);
        }
        if (geometry.kind === "outline-sphere") {
          return new THREE.SphereGeometry(geometry.radius, geometry.widthSegments, geometry.heightSegments);
        }
        throw new Error("Unknown visual geometry kind: " + geometry.kind);
      }

      function standardMaterial(config) {
        const params = {
          roughness: config.roughness ?? 0.7,
          metalness: config.metalness ?? 0,
          side: config.side === "double" ? THREE.DoubleSide : THREE.FrontSide
        };
        if (config.color !== undefined) {
          params.color = toLinear(config.color);
        }
        if (config.texturePattern !== undefined) {
          params.map = textureByPattern(config.texturePattern);
        }
        if (config.alphaMode === "cutout") {
          params.transparent = false;
          params.alphaTest = config.alphaTest;
        }
        return new THREE.MeshStandardMaterial(params);
      }

      function toonMaterial(config) {
        return new THREE.MeshToonMaterial({
          color: toLinear(config.color),
          gradientMap: toonRampTexture(config.toonRamp)
        });
      }

      function sphereTextureMaterial(config) {
        const texture = textureByPattern(config.texturePattern);
        return new THREE.ShaderMaterial({
          uniforms: {
            baseColor: { value: toLinear(config.color) },
            sphereTexture: { value: texture },
            sphereMode: { value: config.sphereMode === "add" ? 1 : 0 },
            lightDirection: { value: new THREE.Vector3(0.42, 0.58, 0.7).normalize() }
          },
          vertexShader: \`
            varying vec3 vNormal;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          \`,
          fragmentShader: \`
            uniform vec3 baseColor;
            uniform sampler2D sphereTexture;
            uniform float sphereMode;
            uniform vec3 lightDirection;
            varying vec3 vNormal;
            void main() {
              vec3 normal = normalize(vNormal);
              float lighting = clamp(dot(normal, lightDirection) * 0.55 + 0.45, 0.0, 1.0);
              vec2 sphereUv = normal.xy * 0.495 + 0.5;
              vec3 sphereColor = texture2D(sphereTexture, sphereUv).rgb;
              vec3 litBase = baseColor * lighting;
              vec3 multiplyColor = litBase * sphereColor;
              vec3 addColor = min(litBase + sphereColor * 0.55, vec3(1.0));
              vec3 color = mix(multiplyColor, addColor, sphereMode);
              gl_FragColor = vec4(color, 1.0);
            }
          \`
        });
      }

      function addOverlapPlanes(scene, geometry, config, useRenderOrder) {
        const red = new THREE.Mesh(geometry, blendMaterial("#e84c4f", config.opacity));
        red.position.set(-0.34, 0.05, 0.02);
        red.rotation.z = -0.18;
        scene.add(red);

        const blue = new THREE.Mesh(geometry, blendMaterial("#2f76d2", config.opacity));
        blue.position.set(0.34, -0.05, 0.01);
        blue.rotation.z = 0.18;
        scene.add(blue);

        if (useRenderOrder) {
          red.renderOrder = config.renderOrder[0];
          blue.renderOrder = config.renderOrder[1];
          red.material.depthTest = false;
          blue.material.depthTest = false;
        }
      }

      function addOutlineSphere(scene, geometryConfig, config) {
        const outline = new THREE.Mesh(
          new THREE.SphereGeometry(
            geometryConfig.radius + config.outlineWidth,
            geometryConfig.widthSegments,
            geometryConfig.heightSegments
          ),
          new THREE.MeshBasicMaterial({ color: config.outlineColor, side: THREE.BackSide })
        );
        outline.scale.setScalar(1.08);
        scene.add(outline);

        scene.add(new THREE.Mesh(
          new THREE.SphereGeometry(geometryConfig.radius, geometryConfig.widthSegments, geometryConfig.heightSegments),
          new THREE.MeshStandardMaterial({
            color: toLinear(config.color),
            roughness: config.roughness,
            metalness: config.metalness
          })
        ));
      }

      function blendMaterial(color, opacity) {
        return new THREE.MeshBasicMaterial({
          color,
          opacity,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide
        });
      }

      function textureByPattern(pattern) {
        if (pattern === "checker") {
          return checkerTexture();
        }
        if (pattern === "cutout") {
          return cutoutTexture();
        }
        if (pattern === "uv-orientation") {
          return uvOrientationTexture();
        }
        if (pattern === "radial-sphere") {
          return radialSphereTexture();
        }
        throw new Error("Unknown visual texture pattern: " + pattern);
      }

      function checkerTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#f7f1df";
        context.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 8; y += 1) {
          for (let x = 0; x < 8; x += 1) {
            context.fillStyle = (x + y) % 2 === 0 ? "#2b8a78" : "#d84f3f";
            context.fillRect(x * 16, y * 16, 16, 16);
          }
        }
        context.fillStyle = "#243145";
        context.fillRect(28, 28, 72, 18);
        context.fillRect(28, 82, 72, 18);
        return nearestTexture(canvas);
      }

      function cutoutTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, 128, 128);
        context.fillStyle = "#2f9e44";
        context.beginPath();
        for (let i = 0; i < 5; i += 1) {
          const outer = -Math.PI / 2 + i * Math.PI * 0.4;
          const inner = outer + Math.PI * 0.2;
          context.lineTo(64 + Math.cos(outer) * 55, 64 + Math.sin(outer) * 55);
          context.lineTo(64 + Math.cos(inner) * 24, 64 + Math.sin(inner) * 24);
        }
        context.closePath();
        context.fill();
        context.fillStyle = "#f7f1df";
        context.fillRect(56, 16, 16, 96);
        return nearestTexture(canvas);
      }

      function uvOrientationTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#f7f1df";
        context.fillRect(0, 0, 128, 128);
        context.fillStyle = "#2b8a78";
        context.fillRect(0, 0, 64, 64);
        context.fillStyle = "#d84f3f";
        context.fillRect(64, 0, 64, 64);
        context.fillStyle = "#2f76d2";
        context.fillRect(0, 64, 64, 64);
        context.fillStyle = "#f3c247";
        context.fillRect(64, 64, 64, 64);
        context.fillStyle = "#141820";
        context.fillRect(12, 12, 40, 10);
        context.fillRect(12, 12, 10, 40);
        context.fillRect(80, 76, 28, 10);
        context.fillRect(108, 76, 8, 32);
        return nearestTexture(canvas);
      }

      function radialSphereTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext("2d", { alpha: false });
        const gradient = context.createRadialGradient(84, 38, 6, 64, 64, 82);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.34, "#9bd6ff");
        gradient.addColorStop(0.68, "#566f9c");
        gradient.addColorStop(1, "#182238");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        context.fillStyle = "#f3c247";
        context.fillRect(80, 24, 18, 18);
        return nearestTexture(canvas);
      }

      function toonRampTexture(pattern) {
        if (pattern !== "three-step-warm") {
          throw new Error("Unknown visual toon ramp: " + pattern);
        }
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 1;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#4b2d28";
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = "#b46638";
        context.fillRect(1, 0, 1, 1);
        context.fillStyle = "#f0a23a";
        context.fillRect(2, 0, 1, 1);
        context.fillStyle = "#ffe6a1";
        context.fillRect(3, 0, 1, 1);
        return nearestTexture(canvas);
      }

      function nearestTexture(canvas) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
      }
    </script>
  </body>
</html>`;
}

await main();
