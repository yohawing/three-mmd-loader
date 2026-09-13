import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(
  process.env.MMD_ANIM_SOURCE_ROOT ?? join(root, "native", "third_party", "mmd-anim")
);
const headerPath = join(
  sourceRoot,
  "crates",
  "mmd-anim-physics-bullet",
  "native",
  "mmd_bullet_api.h"
);
const buildScriptPath = join(root, "scripts", "build-bullet-mmd-wasm.mjs");
const typePath = join(root, "src", "physics", "mmdAnimBullet.ts");
const artifactRoot = join(root, "artifacts", "mmd-anim");
const runtimeRoot = join(artifactRoot, "runtime");
const bulletRoot = join(artifactRoot, "bullet");
const runtimeFiles = ["mmd_anim_wasm.js", "mmd_anim_wasm_bg.wasm", "mmd_anim_wasm.d.ts"];
const bulletFiles = [
  "mmd_bullet.js",
  "mmd_bullet.wasm",
  "mmd_bullet.worker.mjs",
  "mmd_bullet.worker.wasm"
];

function headerSymbols(source) {
  return unique([...source.matchAll(/MMD_ANIM_BULLET_API[\s\S]*?\b(mmd_anim_bullet_[a-z0-9_]+)\s*\(/g)]
    .map((match) => match[1]));
}

function typeSymbols(source) {
  const interfaceBody = source.match(/export interface MmdAnimBulletModule\s*{([\s\S]*?)\n}/)?.[1] ?? "";
  return unique([...interfaceBody.matchAll(/\b(_mmd_anim_bullet_[a-z0-9_]+)\??\s*\(/g)]
    .map((match) => match[1].slice(1)));
}

function wasmSymbols(source) {
  return unique([...source.matchAll(/\b_mmd_anim_bullet_[a-z0-9_]+/g)]
    .map((match) => match[0].slice(1)));
}

function configuredExportSymbols(source) {
  const list = source.match(/const exportedFunctions = \[([\s\S]*?)\n\s*\];/)?.[1] ?? "";
  return unique([...list.matchAll(/"(_mmd_anim_bullet_[a-z0-9_]+)"/g)].map((match) => match[1].slice(1)));
}

function unique(values) {
  return [...new Set(values)].sort();
}

function commandVersion(command, args) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .trim()
      .split(/\r?\n/, 1)[0];
  } catch {
    return "unavailable";
  }
}

function sourceCommit() {
  try {
    return execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return "unavailable";
  }
}

async function sha256(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function requireFile(path) {
  try {
    await stat(path);
  } catch {
    throw new Error(`Required mmd-anim artifact is missing: ${path}`);
  }
}

function assertSame(label, expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((symbol) => !actualSet.has(symbol));
  const extra = actual.filter((symbol) => !expectedSet.has(symbol));
  if (missing.length || extra.length) {
    throw new Error(`${label} ABI mismatch; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}]`);
  }
}

function trackedGeneratedOutputs() {
  try {
    const output = execFileSync("git", [
      "ls-files",
      "--",
      "native/mmd-anim-bullet/dist",
      "src/parser/wasm/generated"
    ], { cwd: root, encoding: "utf8" });
    return output.split(/\r?\n/).filter((path) => path && existsSync(join(root, path)));
  } catch {
    return [];
  }
}

async function verifyAbi() {
  const [header, typeSource, buildSource] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(typePath, "utf8"),
    readFile(buildScriptPath, "utf8")
  ]);
  const expected = headerSymbols(header);
  if (expected.length === 0) throw new Error(`No MMD_ANIM_BULLET_API symbols found in ${headerPath}.`);
  assertSame("Emscripten EXPORTED_FUNCTIONS", expected, configuredExportSymbols(buildSource));
  assertSame("TypeScript raw declaration", expected, typeSymbols(typeSource));
  for (const file of ["mmd_bullet.js", "mmd_bullet.worker.mjs"]) {
    const path = join(bulletRoot, file);
    await requireFile(path);
    assertSame(`Emscripten ${file}`, expected, wasmSymbols(await readFile(path, "utf8")));
  }
  console.log(`mmd-anim Bullet ABI verified (${expected.length} public symbols).`);
  return expected;
}

function verifyNoTrackedGeneratedOutputs() {
  const tracked = trackedGeneratedOutputs();
  if (tracked.length > 0) throw new Error(`Generated web outputs must not be tracked: ${tracked.join(", ")}`);
  console.log("No generated runtime/Bullet web outputs are tracked.");
}

async function createManifest() {
  const files = [];
  for (const [kind, directory, names] of [
    ["runtime", runtimeRoot, runtimeFiles],
    ["bullet", bulletRoot, bulletFiles]
  ]) {
    for (const name of names) {
      const path = join(directory, name);
      await requireFile(path);
      files.push({ kind, path: relative(artifactRoot, path).replaceAll("\\", "/"), sha256: await sha256(path) });
    }
  }
  const manifest = {
    schema: 1,
    source: {
      root: "native/third_party/mmd-anim",
      commit: sourceCommit(),
      headerSha256: await sha256(headerPath)
    },
    toolchain: {
      node: process.version,
      wasmPack: commandVersion("wasm-pack", ["--version"]),
      emscripten: commandVersion("em++", ["--version"])
    },
    artifacts: files
  };
  const path = join(artifactRoot, "manifest.json");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`mmd-anim artifact manifest written to ${path}.`);
  return manifest;
}

async function verifyManifest(path, strictTools) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (manifest.schema !== 1 || !manifest.source || !Array.isArray(manifest.artifacts)) {
    throw new Error(`Unsupported mmd-anim artifact manifest: ${path}`);
  }
  if (manifest.source.commit !== sourceCommit()) throw new Error("mmd-anim source commit does not match manifest.");
  if (manifest.source.headerSha256 !== await sha256(headerPath)) throw new Error("mmd-anim header hash does not match manifest.");
  for (const artifact of manifest.artifacts) {
    const artifactPath = join(artifactRoot, artifact.path);
    await requireFile(artifactPath);
    if (artifact.sha256 !== await sha256(artifactPath)) {
      throw new Error(`Artifact hash mismatch: ${artifact.path}`);
    }
  }
  if (strictTools) {
    const actual = {
      node: process.version,
      wasmPack: commandVersion("wasm-pack", ["--version"]),
      emscripten: commandVersion("em++", ["--version"])
    };
    if (Object.keys(actual).some((key) => actual[key] === "unavailable" || actual[key] !== manifest.toolchain[key])) {
      throw new Error(`Toolchain identity does not match manifest: ${JSON.stringify({ expected: manifest.toolchain, actual })}`);
    }
  }
  console.log(`mmd-anim artifact manifest verified: ${path}.`);
}

const args = new Set(process.argv.slice(2));
if (args.has("--tracked-only")) verifyNoTrackedGeneratedOutputs();
if (args.has("--abi")) await verifyAbi();
if (args.has("--manifest")) await createManifest();
if (args.has("--verify-manifest")) await verifyManifest(process.argv[process.argv.indexOf("--verify-manifest") + 1], args.has("--strict-tools"));
if (!args.has("--tracked-only") && !args.has("--abi") && !args.has("--manifest") && !args.has("--verify-manifest")) {
  throw new Error("Usage: node scripts/check-mmd-anim-artifacts.mjs --tracked-only | --abi [--manifest | --verify-manifest path]");
}
