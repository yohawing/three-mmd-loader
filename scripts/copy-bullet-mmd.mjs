import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const outDir = join(root, "dist", "physics", "mmd");

const candidates = [
  process.env.THREE_MMD_LOADER_BULLET_MMD_JS,
  join(root, "native", "bullet-mmd", "dist", "mmd_bullet.js")
].filter(Boolean);

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

for (const candidate of candidates) {
  const source = resolve(candidate);
  if (!(await pathExists(source))) {
    continue;
  }
  await mkdir(outDir, { recursive: true });
  await copyFile(source, join(outDir, basename(source)));
  const wasmSource = source.replace(/\.js$/i, ".wasm");
  if (!(await pathExists(wasmSource))) {
    throw new Error(`Bullet MMD wasm asset is missing next to ${source}: ${wasmSource}`);
  }
  await copyFile(wasmSource, join(outDir, basename(wasmSource)));
  console.log(`Bullet MMD asset copied to dist/physics/mmd/ from ${source}`);
  process.exit(0);
}

throw new Error(
  `No Bullet MMD asset was found. Build native/bullet-mmd/dist/mmd_bullet.js or set THREE_MMD_LOADER_BULLET_MMD_JS.`
);
