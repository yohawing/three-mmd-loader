import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist", "physics", "ammo");
const outFile = join(outDir, "yw_bullet_ammo.js");
const outWasm = join(outDir, "yw_bullet_ammo.wasm");

const candidates = [
  process.env.THREE_MMD_LOADER_BULLET_AMMO_JS,
  join(root, "native", "bullet", "dist", "yw_bullet_ammo.js"),
  join(root, "src", "physics", "ammo", "generated", "yw_bullet_ammo.js"),
  join(root, "node_modules", "ammo.js", "ammo.js")
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
  await copyFile(source, outFile);
  if (extname(source) === ".js") {
    const wasmSource = join(dirname(source), `${basename(source, ".js")}.wasm`);
    if (await pathExists(wasmSource)) {
      await copyFile(wasmSource, outWasm);
    }
  }
  console.log(`Bullet Ammo asset copied to dist/physics/ammo/ from ${source}`);
  process.exit(0);
}

throw new Error(
  [
    "No Bullet Ammo asset was found.",
    "Set THREE_MMD_LOADER_BULLET_AMMO_JS or generate native/bullet/dist/yw_bullet_ammo.js."
  ].join(" ")
);
