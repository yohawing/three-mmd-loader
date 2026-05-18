import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const defaultOutputDir = path.join(repoRoot, "test-results", "visual", "cases");

export const sceneConfig = Object.freeze({
  resolution: { width: 512, height: 512 },
  pixelRatio: 1,
  camera: {
    type: "OrthographicCamera",
    left: -1.6,
    right: 1.6,
    top: 1.6,
    bottom: -1.6,
    near: 0.1,
    far: 20,
    position: [0, 0, 5],
    target: [0, 0, 0]
  },
  background: "#d8dde4",
  colorSpace: "SRGBColorSpace",
  toneMapping: "NoToneMapping",
  lights: {
    ambient: { color: "#ffffff", intensity: 1.4 },
    directional: { color: "#ffffff", intensity: 2.2, position: [2.5, 3.5, 4] }
  },
  cases: [
    "diffuse-sphere",
    "textured-sphere",
    "alpha-cutout-plane",
    "alpha-blend-overlap",
    "outline-sphere"
  ]
});

const mimeTypes = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".html", "text/html; charset=utf-8"]
]);

async function main() {
  const outputDir = path.resolve(process.argv[2] ?? defaultOutputDir);
  await mkdir(outputDir, { recursive: true });

  const server = await startStaticServer();
  let browser;

  try {
    browser = await chromium.launch(browserLaunchOptions());
    const page = await browser.newPage({
      viewport: sceneConfig.resolution,
      deviceScaleFactor: sceneConfig.pixelRatio
    });

    await page.goto(`${server.origin}/__visual_regression_renderer__`, {
      waitUntil: "networkidle"
    });

    const renderedCases = await page.evaluate(async config => {
      return await globalThis.renderVisualRegressionCases(config);
    }, sceneConfig);

    for (const renderedCase of renderedCases) {
      const buffer = Buffer.from(renderedCase.base64Png, "base64");
      const filePath = path.join(outputDir, `${renderedCase.name}.png`);
      await writeFile(filePath, buffer);
    }

    const hashes = [];
    for (const caseName of sceneConfig.cases) {
      const filePath = path.join(outputDir, `${caseName}.png`);
      hashes.push({ name: caseName, sha256: await sha256File(filePath) });
    }

    console.log(`Rendered ${hashes.length} visual cases to ${path.relative(repoRoot, outputDir)}`);
    for (const hash of hashes) {
      console.log(`${hash.sha256}  ${hash.name}.png`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
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
        for (const caseName of config.cases) {
          const scene = buildScene(config);
          buildCase(caseName, scene);
          renderer.render(scene, camera);
          await new Promise(requestAnimationFrame);
          results.push({
            name: caseName,
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

      function buildCase(caseName, scene) {
        if (caseName === "diffuse-sphere") {
          scene.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.9, 64, 32),
            new THREE.MeshStandardMaterial({
              color: toLinear("#4f8fd9"),
              roughness: 0.65,
              metalness: 0
            })
          ));
          return;
        }

        if (caseName === "textured-sphere") {
          scene.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.9, 64, 32),
            new THREE.MeshStandardMaterial({
              map: checkerTexture(),
              roughness: 0.7,
              metalness: 0
            })
          ));
          return;
        }

        if (caseName === "alpha-cutout-plane") {
          scene.add(new THREE.Mesh(
            new THREE.PlaneGeometry(1.9, 1.9),
            new THREE.MeshStandardMaterial({
              map: cutoutTexture(),
              transparent: false,
              alphaTest: 0.5,
              side: THREE.DoubleSide,
              roughness: 0.8
            })
          ));
          return;
        }

        if (caseName === "alpha-blend-overlap") {
          const geometry = new THREE.PlaneGeometry(1.55, 1.55);
          const red = new THREE.Mesh(geometry, blendMaterial("#e84c4f", 0.58));
          red.position.set(-0.34, 0.05, 0.02);
          red.rotation.z = -0.18;
          scene.add(red);

          const blue = new THREE.Mesh(geometry, blendMaterial("#2f76d2", 0.58));
          blue.position.set(0.34, -0.05, 0.01);
          blue.rotation.z = 0.18;
          scene.add(blue);
          return;
        }

        if (caseName === "outline-sphere") {
          const outline = new THREE.Mesh(
            new THREE.SphereGeometry(0.94, 64, 32),
            new THREE.MeshBasicMaterial({ color: "#141820", side: THREE.BackSide })
          );
          outline.scale.setScalar(1.08);
          scene.add(outline);

          scene.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.9, 64, 32),
            new THREE.MeshStandardMaterial({
              color: toLinear("#f3c247"),
              roughness: 0.55,
              metalness: 0
            })
          ));
          return;
        }

        throw new Error("Unknown visual case: " + caseName);
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

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
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

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        return texture;
      }
    </script>
  </body>
</html>`;
}

function browserLaunchOptions() {
  const executablePath = findBrowserExecutable();
  return executablePath === undefined ? {} : { executablePath };
}

function findBrowserExecutable() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicitPath !== undefined && existsSync(explicitPath)) {
    return explicitPath;
  }

  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    programFiles === undefined ? undefined : path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    programFilesX86 === undefined ? undefined : path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    programFiles === undefined ? undefined : path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    programFilesX86 === undefined ? undefined : path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    localAppData === undefined ? undefined : path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
  ];

  return candidates.find(candidate => candidate !== undefined && existsSync(candidate));
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

await main();
