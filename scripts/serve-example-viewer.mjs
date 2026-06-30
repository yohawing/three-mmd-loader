import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { parseVmdSectionInventory } from "../dist/parser/index.js";

const root = process.cwd();
const viewerRoot = resolve(root, "examples", "viewer");
const localFixturesPath = resolve(root, "test", "fixtures", "fixtures.local.json");
const localFixtureInventory = loadLocalFixtureInventory();
const dataRoot = resolveDataRoot();
const dataRoute = "/__mmd_data/";
const mmdAnimWasmRoot = prepareMmdAnimWasmRoot();
const mmdAnimWasmRoute = "/__mmd_anim_wasm/";
const localAssetsRoute = "/__mmd_assets__/fixtures-local.json";
const port = Number.parseInt(process.env.PORT ?? "3939", 10);
const host = process.env.HOST ?? "127.0.0.1";

const mimeTypes = new Map([
  [".bmp", "image/bmp"],
  [".css", "text/css; charset=utf-8"],
  [".dds", "application/octet-stream"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pmx", "application/octet-stream"],
  [".png", "image/png"],
  [".tga", "image/x-tga"],
  [".vmd", "application/octet-stream"],
  [".vpd", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"]
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
    if (url.pathname === "/examples/viewer" || url.pathname === "/examples/viewer/") {
      response.writeHead(302, {
        Location: `/${url.search}`
      });
      response.end();
      return;
    }

    const pathname = url.pathname;
    if (pathname === localAssetsRoute) {
      const manifest = createLocalAssetManifest();
      if (manifest === undefined) {
        response.writeHead(404, {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8"
        });
        response.end(JSON.stringify({ error: "Local fixture inventory is not available." }));
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(`${JSON.stringify(manifest, null, 2)}\n`);
      return;
    }
    if (pathname === mmdAnimWasmRoute || pathname === `${mmdAnimWasmRoute}package.json`) {
      response.writeHead(404, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end("Not found");
      return;
    }

    const filePath = resolveRequestPath(pathname);

    if (!isAllowedPath(filePath)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const info = await stat(filePath);
    const resolvedFilePath = info.isDirectory() ? join(filePath, "index.html") : filePath;
    const resolvedInfo = info.isDirectory() ? await stat(resolvedFilePath) : info;
    const contentType = mimeTypes.get(extname(resolvedFilePath)) ?? "application/octet-stream";
    const totalSize = resolvedInfo.size;
    const range = parseRangeHeader(request.headers.range, totalSize);
    if (range !== undefined) {
      response.writeHead(206, {
        "Cache-Control": "no-store",
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${range.start}-${range.end}/${totalSize}`,
        "Content-Length": range.end - range.start + 1
      });
      createReadStream(resolvedFilePath, { start: range.start, end: range.end }).pipe(response);
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": totalSize
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

server.listen(port, host, () => {
  console.log(`MMD viewer example: http://${host}:${port}/`);
  if (dataRoot === undefined) {
    console.log(`MMD data route disabled. Set MMD_DATA_ROOT to serve local MMD assets.`);
  } else {
    console.log(`MMD data route: ${dataRoute} -> ${dataRoot}`);
    if (localFixtureInventory !== undefined) {
      console.log(`MMD local assets: ${localAssetsRoute} from ${localFixturesPath}`);
    }
  }
  if (mmdAnimWasmRoot === undefined) {
    console.log(`mmd-anim WASM route disabled. Set MMD_ANIM_WASM_ROOT to serve MmdAnimRuntime.`);
  } else {
    console.log(`mmd-anim WASM route: ${mmdAnimWasmRoute} -> ${mmdAnimWasmRoot}`);
  }
});

function parseRangeHeader(headerValue, totalSize) {
  if (typeof headerValue !== "string" || totalSize <= 0) {
    return undefined;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(headerValue.trim());
  if (match === null) {
    return undefined;
  }
  const [, startRaw, endRaw] = match;
  let start;
  let end;
  if (startRaw === "") {
    if (endRaw === "") {
      return undefined;
    }
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return undefined;
    }
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = Number.parseInt(startRaw, 10);
    end = endRaw === "" ? totalSize - 1 : Number.parseInt(endRaw, 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }
  end = Math.min(end, totalSize - 1);
  if (start < 0 || start > end) {
    return undefined;
  }
  return { start, end };
}

function loadLocalFixtureInventory() {
  if (!existsSync(localFixturesPath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(localFixturesPath, "utf8"));
  } catch (error) {
    console.warn(
      `Failed to read local fixture inventory: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

function resolveDataRoot() {
  if (process.env.MMD_DATA_ROOT !== undefined) {
    return resolve(process.env.MMD_DATA_ROOT);
  }
  if (typeof localFixtureInventory?.basePath === "string") {
    return resolve(dirname(localFixturesPath), localFixtureInventory.basePath);
  }
  return undefined;
}

function resolveMmdAnimWasmRoot() {
  if (process.env.MMD_ANIM_WASM_ROOT !== undefined) {
    return resolve(process.env.MMD_ANIM_WASM_ROOT);
  }
  const localMmdAnimPkg = resolve(root, "..", "mmd-anim", "crates", "mmd-anim-wasm", "pkg");
  return existsSync(join(localMmdAnimPkg, "mmd_anim_wasm.js")) ? localMmdAnimPkg : undefined;
}

function prepareMmdAnimWasmRoot() {
  const sourceRoot = resolveMmdAnimWasmRoot();
  if (sourceRoot === undefined) {
    return undefined;
  }
  const viewerWasmRoot = resolve(viewerRoot, ".mmd-anim-wasm");
  rmSync(viewerWasmRoot, { recursive: true, force: true });
  mkdirSync(viewerWasmRoot, { recursive: true });
  for (const file of ["mmd_anim_wasm.js", "mmd_anim_wasm_bg.wasm", "mmd_anim_wasm.d.ts"]) {
    const source = join(sourceRoot, file);
    if (existsSync(source)) {
      copyFileSync(source, join(viewerWasmRoot, file));
    } else if (file !== "mmd_anim_wasm.d.ts") {
      throw new Error(`Required mmd-anim WASM artifact missing: ${source}`);
    }
  }
  return viewerWasmRoot;
}

function createLocalAssetManifest() {
  if (localFixtureInventory === undefined || dataRoot === undefined) {
    return undefined;
  }

  const byExtension = localFixtureInventory.paths?.releaseSmoke?.byExtension ?? {};
  const models = [
    ...createAssetEntries("pmx", byExtension.pmx),
    ...createAssetEntries("pmd", byExtension.pmd)
  ];
  const vmdEntries = splitVmdAssetEntries(byExtension.vmd);
  const motions = vmdEntries.motions;
  const poses = createAssetEntries("vpd", byExtension.vpd);
  const backgrounds = [
    ...createAssetEntries("backgroundPmx", byExtension.backgroundPmx),
    ...createAssetEntries("backgroundPmd", byExtension.backgroundPmd)
  ];
  const cameras = dedupeAssetsByUrl([
    ...createAssetEntries("cameraVmd", byExtension.cameraVmd),
    ...vmdEntries.cameras.map((motion) => ({
      ...motion,
      id: `camera:${motion.id}`
    }))
  ]);
  const audios = [
    ...createAssetEntries("wav", byExtension.wav),
    ...createAssetEntries("mp3", byExtension.mp3),
    ...createAssetEntries("ogg", byExtension.ogg)
  ];
  const presets = createPresetEntries(localFixtureInventory.paths?.playbackSmoke?.cases, byExtension);

  return {
    schemaVersion: 1,
    source: "fixtures.local.json",
    dataRoute,
    presets,
    models,
    motions,
    poses,
    backgrounds,
    audios,
    cameras
  };
}

function createAssetEntries(extension, fixtureMap) {
  return Object.entries(fixtureMap ?? {}).flatMap(([key, fixturePath]) => {
    const url = dataUrlForFixturePath(fixturePath);
    if (url === undefined) {
      return [];
    }
    return [{
      id: `${extension}:${key}`,
      key,
      extension,
      name: `${key} - ${basename(fixturePath)}`,
      url
    }];
  });
}

function splitVmdAssetEntries(fixtureMap) {
  const motions = [];
  const cameras = [];
  for (const entry of createAssetEntries("vmd", fixtureMap)) {
    if (isCameraOnlyVmdFixturePath(fixtureMap?.[entry.key])) {
      cameras.push(entry);
    } else {
      motions.push(entry);
    }
  }
  return { motions, cameras };
}

function isCameraOnlyVmdFixturePath(fixturePath) {
  const filePath = resolveFixturePath(fixturePath);
  if (filePath === undefined || !isPathInside(filePath, dataRoot)) {
    return false;
  }
  try {
    const counts = parseVmdSectionInventory(readFileSync(filePath)).counts;
    return counts.cameras > 0 && counts.bones === 0 && counts.morphs === 0;
  } catch {
    return false;
  }
}

function dedupeAssetsByUrl(assets) {
  const seen = new Set();
  return assets.filter((asset) => {
    if (seen.has(asset.url)) {
      return false;
    }
    seen.add(asset.url);
    return true;
  });
}

function createPresetEntries(cases, byExtension) {
  if (!Array.isArray(cases)) {
    return [];
  }
  return cases.flatMap((fixtureCase) => {
    const modelPath = byExtension?.[fixtureCase.model?.extension]?.[fixtureCase.model?.key];
    const modelUrl = dataUrlForFixturePath(modelPath);
    const motionPath = byExtension?.vmd?.[fixtureCase.motion?.key];
    const motionUrl = dataUrlForFixturePath(motionPath);
    const backgroundUrl = dataUrlForFixturePath(
      byExtension?.[fixtureCase.background?.extension]?.[fixtureCase.background?.key]
    );
    const cameraUrl = dataUrlForFixturePath(byExtension?.cameraVmd?.[fixtureCase.camera?.key]);
    const audioUrl = dataUrlForFixturePath(
      byExtension?.[fixtureCase.audio?.extension]?.[fixtureCase.audio?.key]
    );
    const audioOffsetFrame = parseAudioOffsetFrame(
      fixtureCase.audioOffsetFrame ?? fixtureCase.audio?.offsetFrame
    );
    if (modelUrl === undefined || motionUrl === undefined) {
      return [];
    }
    return [{
      id: fixtureCase.name,
      name: fixtureCase.name,
      modelUrl,
      motionUrl,
      ...(backgroundUrl ? { backgroundUrl } : {}),
      ...(cameraUrl ? { cameraUrl } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      ...(audioOffsetFrame !== undefined ? { audioOffsetFrame } : {})
    }];
  });
}

function parseAudioOffsetFrame(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function dataUrlForFixturePath(fixturePath) {
  if (typeof fixturePath !== "string") {
    return undefined;
  }
  const filePath = resolveFixturePath(fixturePath);
  if (filePath === undefined || !isPathInside(filePath, dataRoot)) {
    return undefined;
  }
  return `${dataRoute}${relative(dataRoot, filePath).split(sep).map(encodeURIComponent).join("/")}`;
}

function resolveFixturePath(fixturePath) {
  if (dataRoot === undefined) {
    return undefined;
  }
  return resolve(dataRoot, fixturePath);
}

function resolveRequestPath(pathname) {
  if (pathname.startsWith(dataRoute)) {
    if (dataRoot === undefined) {
      return resolve(root, "__mmd_data_root_not_configured__");
    }
    const relativePath = normalize(decodeURIComponent(pathname.slice(dataRoute.length))).replace(
      /^[/\\]+/,
      ""
    );
    return resolve(dataRoot, relativePath);
  }
  if (pathname.startsWith(mmdAnimWasmRoute)) {
    if (mmdAnimWasmRoot === undefined) {
      return resolve(root, "__mmd_anim_wasm_not_configured__");
    }
    const relativePath = normalize(decodeURIComponent(pathname.slice(mmdAnimWasmRoute.length))).replace(
      /^[/\\]+/,
      ""
    );
    return resolve(mmdAnimWasmRoot, relativePath);
  }
  if (pathname === "/") {
    return resolve(viewerRoot, "index.html");
  }
  if (pathname.startsWith("/lib/")) {
    const relativePath = normalize(decodeURIComponent(pathname.slice("/lib/".length))).replace(
      /^[/\\]+/,
      ""
    );
    return resolve(viewerRoot, "lib", relativePath);
  }
  if (pathname.startsWith("/assets/")) {
    const relativePath = normalize(decodeURIComponent(pathname.slice("/assets/".length))).replace(
      /^[/\\]+/,
      ""
    );
    return resolve(viewerRoot, "assets", relativePath);
  }
  if (pathname === "/main.js" || pathname === "/styles.css" || pathname === "/viewer.js") {
    return resolve(viewerRoot, pathname.slice(1));
  }
  return resolve(root, `.${normalize(decodeURIComponent(pathname))}`);
}

function isAllowedPath(filePath) {
  return (
    isPathInside(filePath, root) ||
    isPathInside(filePath, viewerRoot) ||
    (dataRoot !== undefined && isPathInside(filePath, dataRoot)) ||
    (mmdAnimWasmRoot !== undefined && isPathInside(filePath, mmdAnimWasmRoot))
  );
}

function isPathInside(filePath, parentPath) {
  const normalizedFilePath = resolve(filePath).toLowerCase();
  const normalizedParentPath = resolve(parentPath).toLowerCase();
  return (
    normalizedFilePath === normalizedParentPath ||
    normalizedFilePath.startsWith(`${normalizedParentPath}${sep}`)
  );
}
