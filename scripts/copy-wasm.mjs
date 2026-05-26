import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "parser", "wasm", "generated");
const dst = join(root, "dist", "parser", "wasm", "generated");

await mkdir(dst, { recursive: true });
for (const file of ["yw_mmd_core.js", "yw_mmd_core.wasm", "yw_mmd_core.d.ts"]) {
  try {
    await copyFile(join(src, file), join(dst, file));
  }
  catch (error) {
    if (error?.code === "ENOENT" && file !== "yw_mmd_core.d.ts") {
      throw new Error(`${file} is missing. Run npm run build:wasm before npm run build.`);
    }
    throw error;
  }
}
console.log("wasm assets copied to dist/parser/wasm/generated/");
