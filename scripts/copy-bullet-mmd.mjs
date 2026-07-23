import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const outDir = join(root, "dist", "physics", "mmd");

const candidates = [
  process.env.THREE_MMD_LOADER_BULLET_MMD_JS,
  join(root, "native", "bullet-mmd", "dist", "mmd_bullet.js")
].filter(Boolean);

const workerCandidates = [
  process.env.THREE_MMD_LOADER_BULLET_MMD_WORKER_MJS,
  join(root, "native", "bullet-mmd", "dist", "mmd_bullet.worker.mjs")
].filter(Boolean);

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function findArtifact(candidates, label) {
  for (const candidate of candidates) {
    const source = resolve(candidate);
    if (await pathExists(source)) {
      return source;
    }
  }
  throw new Error(`No Bullet MMD ${label} artifact was found.`);
}

async function copyPair(source, targetName) {
  const wasmSource = source.replace(/\.(?:m?js)$/i, ".wasm");
  if (!(await pathExists(wasmSource))) {
    throw new Error(`Bullet MMD wasm asset is missing next to ${source}: ${wasmSource}`);
  }
  await copyFile(source, join(outDir, targetName));
  await copyFile(wasmSource, join(outDir, targetName.replace(/\.(?:m?js)$/i, ".wasm")));
}

try {
  const classicSource = await findArtifact(candidates, "classic");
  const workerSource = await findArtifact(workerCandidates, "module-worker");
  await mkdir(outDir, { recursive: true });
  await copyPair(classicSource, "mmd_bullet.js");
  await copyPair(workerSource, "mmd_bullet.worker.mjs");
  console.log(`Bullet MMD classic and module-worker assets copied to dist/physics/mmd/.`);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(
    `${detail} Build native/bullet-mmd/dist artifacts with npm run build:bullet:mmd, ` +
      `or set THREE_MMD_LOADER_BULLET_MMD_JS and THREE_MMD_LOADER_BULLET_MMD_WORKER_MJS.`
  );
}
