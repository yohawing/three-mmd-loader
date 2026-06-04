import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const srcDir = join(root, "src", "parser", "wasm", "generated");
const dstDir = join(root, "dist", "parser", "wasm", "generated");

async function main() {
  if (!existsSync(srcDir)) {
    throw new Error(
      `mmd-anim-wasm pkg not found at ${srcDir}.\n` +
      "Run: npm run build:mmd-anim to build and sync the wasm package first."
    );
  }

  await mkdir(dstDir, { recursive: true });

  const files = [
    "mmd_anim_wasm.js",
    "mmd_anim_wasm_bg.wasm",
    "mmd_anim_wasm.d.ts"
  ];

  for (const file of files) {
    const src = join(srcDir, file);
    const dst = join(dstDir, file);
    if (!existsSync(src)) {
      if (file === "mmd_anim_wasm.d.ts") {
        console.warn(`Optional ${file} not found in pkg, skipping.`);
        continue;
      }
      throw new Error(`Required wasm artifact ${file} missing at ${src}.`);
    }
    await copyFile(src, dst);
  }

  console.log(`mmd-anim-wasm artifacts copied to ${dstDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
