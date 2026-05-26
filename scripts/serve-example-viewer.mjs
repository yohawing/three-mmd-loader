import { createReadStream, existsSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, dirname, extname, join, normalize, relative, resolve, sep } from "node:path";

const root = process.cwd();
const viewerRoot = resolve(root, "examples", "viewer");
const localFixturesPath = resolve(root, "test", "fixtures", "fixtures.local.json");
const localFixtureInventory = loadLocalFixtureInventory();
const dataRoot = resolveDataRoot();
const dataRoute = "/__mmd_data/";
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
        Location: "/"
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

    const filePath = resolveRequestPath(pathname);

    if (!isAllowedPath(filePath)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const info = await stat(filePath);
    const resolvedFilePath = info.isDirectory() ? join(filePath, "index.html") : filePath;
    const contentType = mimeTypes.get(extname(resolvedFilePath)) ?? "application/octet-stream";
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
});

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

function createLocalAssetManifest() {
  if (localFixtureInventory === undefined || dataRoot === undefined) {
    return undefined;
  }

  const byExtension = localFixtureInventory.paths?.releaseSmoke?.byExtension ?? {};
  const models = [
    ...createAssetEntries("pmx", byExtension.pmx),
    ...createAssetEntries("pmd", byExtension.pmd)
  ];
  const motions = createAssetEntries("vmd", byExtension.vmd);
  const poses = createAssetEntries("vpd", byExtension.vpd);
  const backgrounds = [
    ...createAssetEntries("backgroundPmx", byExtension.backgroundPmx),
    ...createAssetEntries("backgroundPmd", byExtension.backgroundPmd)
  ];
  const cameraSourceEntries = Object.keys(byExtension.cameraVmd ?? {}).length > 0
    ? createAssetEntries("cameraVmd", byExtension.cameraVmd)
    : motions;
  const cameras = cameraSourceEntries.map((motion) => ({
    ...motion,
    id: `camera:${motion.id}`
  }));
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

function createPresetEntries(cases, byExtension) {
  if (!Array.isArray(cases)) {
    return [];
  }
  return cases.flatMap((fixtureCase) => {
    const modelPath = byExtension?.[fixtureCase.model?.extension]?.[fixtureCase.model?.key];
    const modelUrl = dataUrlForFixturePath(modelPath);
    const motionPath = byExtension?.vmd?.[fixtureCase.motion?.key];
    const motionUrl = dataUrlForFixturePath(motionPath);
    if (modelUrl === undefined || motionUrl === undefined) {
      return [];
    }
    return [{
      id: fixtureCase.name,
      name: fixtureCase.name,
      modelUrl,
      motionUrl
    }];
  });
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
  if (pathname === "/main.js" || pathname === "/styles.css" || pathname === "/viewer.js") {
    return resolve(viewerRoot, pathname.slice(1));
  }
  return resolve(root, `.${normalize(decodeURIComponent(pathname))}`);
}

function isAllowedPath(filePath) {
  return (
    isPathInside(filePath, root) ||
    isPathInside(filePath, viewerRoot) ||
    (dataRoot !== undefined && isPathInside(filePath, dataRoot))
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
