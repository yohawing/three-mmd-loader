import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
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
