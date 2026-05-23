import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "parser", "wasm", "generated");
const dst = join(root, "dist", "parser", "wasm", "generated");

await mkdir(dst, { recursive: true });
for (const file of ["yw_mmd_core.js", "yw_mmd_core.wasm", "yw_mmd_core.d.ts"]) {
  await copyFile(join(src, file), join(dst, file));
}
console.log("wasm assets copied to dist/parser/wasm/generated/");
