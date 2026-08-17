import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "dist/parser/wasm/generated/mmd_anim_wasm.js",
  "dist/parser/wasm/generated/mmd_anim_wasm_bg.wasm",
  "dist/physics/mmd/mmd_bullet.js",
  "dist/physics/mmd/mmd_bullet.wasm",
  "dist/physics/mmd/mmd_bullet.worker.mjs",
  "dist/physics/mmd/mmd_bullet.worker.wasm"
];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const dryRunPath = argument("--dry-run");
const packagePath = argument("--package");
const expectedHashPath = argument("--expected-hash");
const writeHashPath = argument("--write-hash");

if (!dryRunPath && !packagePath) {
  throw new Error("Usage: node scripts/check-package-tarball.mjs --dry-run npm-pack-dry-run.json --package package.tgz");
}

if (dryRunPath) {
  const report = JSON.parse(await readFile(resolve(root, dryRunPath), "utf8"));
  const files = new Set((report[0]?.files ?? []).map((entry) => entry.path));
  const missing = requiredFiles.filter((path) => !files.has(path));
  if (missing.length > 0) throw new Error(`npm pack dry-run is missing required web artifacts: ${missing.join(", ")}`);
  if ([...files].some((path) => path.startsWith("native/mmd-anim-bullet/") || path.startsWith("src/parser/wasm/generated/"))) {
    throw new Error("npm pack dry-run contains source-tree generated artifacts.");
  }
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (report[0]?.version !== packageJson.version) throw new Error("npm pack version does not match package.json.");
  console.log(`npm pack dry-run verified (${requiredFiles.length} web artifacts).`);
}

if (packagePath) {
  const path = resolve(root, packagePath);
  const bytes = await readFile(path);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (expectedHashPath) {
    const expected = (await readFile(resolve(root, expectedHashPath), "utf8")).trim().split(/\s+/, 1)[0];
    if (expected !== hash) throw new Error(`npm tarball SHA-256 mismatch for ${basename(path)}.`);
  }
  if (writeHashPath) {
    const target = resolve(root, writeHashPath);
    await writeFile(target, `${hash}  ${basename(path)}\n`);
  }
  console.log(`npm tarball SHA-256 verified: ${hash}`);
}
