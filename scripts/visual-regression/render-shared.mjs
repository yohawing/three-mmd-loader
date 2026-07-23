import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

export function browserLaunchOptions() {
  const executablePath = findBrowserExecutable();
  return executablePath === undefined ? {} : { executablePath };
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// Extensions whose Content-Type is identical across every visual-regression
// static server. Callers spread this into their own mimeTypes Map and add any
// script-specific extensions (some of which map the same extension to a
// different Content-Type, so those are intentionally left out here).
export const commonWebMimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".pmx", "application/octet-stream"],
  [".wasm", "application/wasm"]
]);

// Shared static-file server used by the viewer-driving visual-regression
// scripts: resolves a request to a local file via the caller-supplied
// `resolveRequestPath`, streams it back with a Content-Type looked up from
// `mimeTypes`, and serves `index.html` for directory paths.
export async function startStaticServer(resolveRequestPath, mimeTypes) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const filePath = resolveRequestPath(url.pathname);
      if (!filePath) return response.writeHead(403).end("Forbidden");
      const info = await stat(filePath);
      const resolved = info.isDirectory() ? path.join(filePath, "index.html") : filePath;
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes.get(path.extname(resolved).toLowerCase()) ?? "application/octet-stream"
      });
      createReadStream(resolved).pipe(response);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });
  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Failed to allocate local port."));
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close(error => error ? fail(error) : done()))
      });
    });
  });
}

export function isPathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

// Strict argument-value reader: throws if the flag has no value or the next
// token itself looks like another flag. Shared by the scripts that hand-roll
// `requireValue`/`requireRawValue` with this exact behavior.
export function requireArgValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

// Lenient argument-value reader: just returns the next token (or undefined),
// leaving validation to the caller. Shared by scripts whose parseArgs loop
// checks `arg === "--flag" && value` before consuming it.
export function peekArgValue(args, index) {
  return args[index + 1];
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
