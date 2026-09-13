import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = join(root, "artifacts", "mmd-anim", "runtime");
const sourceDir = join(root, "src", "parser", "wasm", "generated");
const files = ["mmd_anim_wasm.js", "mmd_anim_wasm_bg.wasm", "mmd_anim_wasm.d.ts"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(artifactDir))) {
  throw new Error(`mmd-anim runtime artifacts are missing at ${artifactDir}. Run npm run build:mmd-anim first.`);
}

await rm(sourceDir, { recursive: true, force: true });
await mkdir(sourceDir, { recursive: true });
for (const file of files) {
  const source = join(artifactDir, file);
  if (!(await exists(source))) {
    throw new Error(`Required mmd-anim runtime artifact is missing: ${source}`);
  }
  await copyFile(source, join(sourceDir, file));
}

console.log(`Prepared transient mmd-anim source modules at ${sourceDir}.`);
