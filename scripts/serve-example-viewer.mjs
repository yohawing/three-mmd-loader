import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = process.cwd();
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = process.env.HOST ?? "127.0.0.1";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pmx", "application/octet-stream"],
  [".vmd", "application/octet-stream"],
  [".vpd", "text/plain; charset=utf-8"]
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
    const pathname = url.pathname === "/" ? "/examples/viewer/index.html" : url.pathname;
    const filePath = resolve(root, `.${normalize(pathname)}`);

    if (!filePath.startsWith(`${root}${sep}`) && filePath !== root) {
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
  console.log(`MMD viewer example: http://${host}:${port}/examples/viewer/`);
});
