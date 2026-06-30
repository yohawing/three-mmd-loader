import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const sourceRoot = resolve(process.env.MMD_ANIM_SOURCE_ROOT ?? join(root, "..", "mmd-anim"));
const crateDir = join(sourceRoot, "crates", "mmd-anim-wasm");
const pkgDir = join(crateDir, "pkg");
const generatedDir = join(root, "src", "parser", "wasm", "generated");
const artifacts = [
  "mmd_anim_wasm.js",
  "mmd_anim_wasm_bg.wasm",
  "mmd_anim_wasm.d.ts"
];

function spawnCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(signal ? `${command} exited with signal ${signal}` : `${command} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  if (!existsSync(crateDir)) {
    throw new Error(
      `mmd-anim-wasm crate not found at ${crateDir}.\n` +
      "Set MMD_ANIM_SOURCE_ROOT to a local mmd-anim checkout if it is not a sibling of this repository."
    );
  }

  console.log(`Building mmd-anim-wasm from ${sourceRoot} ...`);
  await spawnCommand("wasm-pack", ["build", "--target", "web", "--out-dir", "pkg"], crateDir);
  await copyArtifacts(pkgDir, generatedDir);
  console.log(`mmd-anim-wasm build complete: ${pkgDir}`);
}

async function copyArtifacts(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true });
  for (const file of artifacts) {
    const src = join(srcDir, file);
    const dst = join(dstDir, file);
    if (!existsSync(src)) {
      throw new Error(`Required mmd-anim wasm artifact missing: ${src}`);
    }
    await copyFile(src, dst);
  }
  console.log(`mmd-anim-wasm source artifacts copied to ${dstDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  console.error("Ensure wasm-pack is installed: https://rustwasm.github.io/wasm-pack/");
  process.exit(1);
});
