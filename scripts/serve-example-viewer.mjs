import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = process.cwd();
const viewerRoot = resolve(root, "examples", "viewer");
const dataRoot = process.env.MMD_VIEWER_DATA_ROOT === undefined
  ? undefined
  : resolve(process.env.MMD_VIEWER_DATA_ROOT);
const dataRoute = "/__mmd_data/";
const port = Number.parseInt(process.env.PORT ?? "3939", 10);
const host = process.env.HOST ?? "127.0.0.1";

const mimeTypes = new Map([
  [".bmp", "image/bmp"],
  [".css", "text/css; charset=utf-8"],
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
    console.log(`MMD viewer data route disabled. Set MMD_VIEWER_DATA_ROOT to serve local MMD assets.`);
  } else {
    console.log(`MMD viewer data route: ${dataRoute} -> ${dataRoot}`);
  }
});

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
