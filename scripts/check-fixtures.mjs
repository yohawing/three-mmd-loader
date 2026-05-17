#!/usr/bin/env node
// Run every PMD / PMX / VMD / VPD path listed in data/fixtures.json through the
// full parsers in `dist/`. Reports per-file pass / fail / warning diagnostics
// and writes a JSON report to tmp/fixture-parse-report.json.
//
// Usage:
//   node scripts/check-fixtures.mjs                 # run all categories
//   node scripts/check-fixtures.mjs pmx vmd         # subset by category
//   node scripts/check-fixtures.mjs --limit 20      # limit per category
//   node scripts/check-fixtures.mjs --bail          # stop at first failure
//   node scripts/check-fixtures.mjs --no-three      # parse only, skip PMX/PMD Three.js assembly
//   node scripts/check-fixtures.mjs ../data/fixtures.json
//   node scripts/check-fixtures.mjs --limit 20 ../data/fixtures.json
//   FIXTURES_JSON=path/to/fixtures.json node ...    # override fixture index

import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { resolve, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";

import { parsePmd } from "../dist/parser/model/PmdModelParser.js";
import { parsePmx } from "../dist/parser/model/PmxModelParser.js";
import { parseVmd } from "../dist/parser/vmd/VmdParser.js";
import { parseVpdPose } from "../dist/parser/vpd/VpdMetadataParser.js";
import { ThreeMmdLoader } from "../dist/three/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const defaultFixturesPath = resolve(projectRoot, "..", "data", "fixtures.json");

const KNOWN_CATEGORIES = ["pmx", "pmd", "vmd", "vpd"];
const THREE_MODEL_CATEGORIES = new Set(["pmx", "pmd"]);
const TEXTURE_FILE_PATTERN = /\.(?:bmp|dds|gif|jpe?g|png|spa|sph|tga|webp)$/i;
const BUILT_IN_TOON_PATTERN = /^toon(?:0[1-9]|10)\.bmp$/i;
const PARSERS = {
  pmx: parsePmx,
  pmd: parsePmd,
  vmd: (bytes) => parseVmd(bytes),
  vpd: parseVpdPose
};
const textureLoader = createNodeTextureLoader();

function parseArgs(argv) {
  const args = {
    categories: [],
    limit: Infinity,
    bail: false,
    fixturesPath: undefined,
    three: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--bail") {
      args.bail = true;
    } else if (value === "--no-three") {
      args.three = false;
    } else if (value === "--limit") {
      args.limit = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(args.limit) || args.limit <= 0) {
        throw new Error(`--limit requires a positive integer`);
      }
    } else if (KNOWN_CATEGORIES.includes(value)) {
      args.categories.push(value);
    } else if (value.endsWith(".json")) {
      if (args.fixturesPath !== undefined) {
        throw new Error(`Multiple fixtures.json paths provided`);
      }
      args.fixturesPath = resolve(value);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (args.categories.length === 0) {
    args.categories = [...KNOWN_CATEGORIES];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturesPath = args.fixturesPath
    ?? (process.env.FIXTURES_JSON ? resolve(process.env.FIXTURES_JSON) : defaultFixturesPath);
  // fixtures.json sits at MMDDev/data/fixtures.json but lists paths like
  // "data/pmd/...", so resolve against the parent of the json's directory.
  const fixturesRoot = resolve(dirname(fixturesPath), "..");
  const fixtures = JSON.parse(await readFile(fixturesPath, "utf8"));
  const byExtension = fixtures?.paths?.releaseSmoke?.byExtension ?? {};

  const results = { startedAt: new Date().toISOString(), categories: {} };
  let totalChecked = 0;
  let totalFailed = 0;

  outer: for (const category of args.categories) {
    const entries = Object.entries(byExtension[category] ?? {}).slice(0, args.limit);
    const summary = { total: entries.length, passed: 0, failed: 0, files: [] };
    results.categories[category] = summary;
    console.log(`\n=== ${category.toUpperCase()} (${entries.length} files) ===`);

    for (const [key, relativePath] of entries) {
      const absolutePath = resolve(fixturesRoot, relativePath);
      const record = {
        key,
        path: relativePath,
        status: "pass",
        elapsedMs: 0,
        bytes: 0
      };
      let start;
      totalChecked += 1;
      try {
        const fileStat = await stat(absolutePath);
        record.bytes = fileStat.size;
        const buffer = await readFile(absolutePath);
        start = performance.now();
        const parsed = PARSERS[category](buffer);
        const diagnostics = parsed?.metadata?.diagnostics;
        if (Array.isArray(diagnostics) && diagnostics.length > 0) {
          record.diagnostics = diagnostics;
          const errors = diagnostics.filter((d) => d.level === "error");
          if (errors.length > 0) {
            record.status = "warn-errors";
          } else {
            record.status = "warn";
          }
        }
        record.summary = summarizeParsed(category, parsed);
        if (args.three && THREE_MODEL_CATEGORIES.has(category)) {
          const textureReferences = collectMaterialTextureReferences(parsed);
          const textureWarnings = [];
          const textureResolver = await createFixtureTextureResolver(
            dirname(absolutePath),
            textureReferences,
            textureWarnings
          );
          let threeModel;
          try {
            threeModel = await new ThreeMmdLoader({
              textureLoader,
              textureResolver
            }).loadModel(buffer);
            record.threeSummary = summarizeThreeModel(threeModel);
          } finally {
            if (threeModel) {
              disposeThreeModel(threeModel);
            }
          }
          if (textureWarnings.length > 0) {
            record.textureWarnings = textureWarnings;
            if (record.status === "pass") {
              record.status = "warn";
            }
          }
        }
        record.elapsedMs = +(performance.now() - start).toFixed(2);
        summary.passed += 1;
      } catch (error) {
        if (typeof start === "number") {
          record.elapsedMs = +(performance.now() - start).toFixed(2);
        }
        record.status = "fail";
        record.error = {
          name: error?.name ?? "Error",
          message: error?.message ?? String(error),
          stack: error?.stack?.split("\n").slice(0, 4).join("\n")
        };
        summary.failed += 1;
        totalFailed += 1;
      }
      summary.files.push(record);

      const icon =
        record.status === "pass"
          ? " "
          : record.status === "warn"
          ? "!"
          : record.status === "warn-errors"
          ? "?"
          : "X";
      const size = `${(record.bytes / 1024).toFixed(0)}KB`.padStart(8);
      const ms = `${record.elapsedMs.toFixed(1)}ms`.padStart(9);
      console.log(`${icon} ${key} ${size} ${ms}  ${relativePath}`);
      if (record.status === "fail") {
        console.log(`     -> ${record.error.message}`);
      } else {
        if (Array.isArray(record.diagnostics)) {
          for (const diagnostic of record.diagnostics) {
            console.log(`     ~ ${diagnostic.level}/${diagnostic.code}: ${diagnostic.message}`);
          }
        }
        if (Array.isArray(record.textureWarnings)) {
          for (const warning of record.textureWarnings) {
            console.log(
              `     ~ texture/${warning.textureKind}: missing ${warning.path}`
            );
          }
        }
      }

      if (args.bail && record.status === "fail") {
        break outer;
      }
    }

    console.log(`-- ${category}: ${summary.passed} passed, ${summary.failed} failed`);
  }

  results.totals = { checked: totalChecked, failed: totalFailed };
  results.finishedAt = new Date().toISOString();

  const reportDir = resolve(projectRoot, "tmp");
  await mkdir(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, "fixture-parse-report.json");
  await writeFile(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport written: ${relative(projectRoot, reportPath)}`);
  console.log(`Totals: ${totalChecked} checked, ${totalFailed} failed`);

  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

function summarizeParsed(category, parsed) {
  if (category === "pmx" || category === "pmd") {
    return {
      format: parsed?.metadata?.format,
      version: parsed?.metadata?.version,
      name: parsed?.metadata?.name,
      encoding: parsed?.metadata?.encoding,
      bones: parsed?.skeleton?.bones?.length ?? 0,
      vertices: parsed?.geometry?.positions?.length
        ? parsed.geometry.positions.length / 3
        : 0,
      faces: parsed?.geometry?.indices?.length
        ? parsed.geometry.indices.length / 3
        : 0,
      materials: parsed?.materials?.length ?? 0,
      morphs: parsed?.morphs?.length ?? 0,
      rigidBodies: parsed?.rigidBodies?.length ?? 0,
      joints: parsed?.joints?.length ?? 0
    };
  }
  if (category === "vmd") {
    return {
      bonesFrames: parsed?.boneFrames?.length ?? 0,
      morphFrames: parsed?.morphFrames?.length ?? 0,
      cameraFrames: parsed?.cameraFrames?.length ?? 0,
      lightFrames: parsed?.lightFrames?.length ?? 0,
      ikFrames: parsed?.propertyFrames?.length ?? 0
    };
  }
  if (category === "vpd") {
    return {
      modelFile: parsed?.modelFile,
      bones: parsed?.bonePoses?.length ?? 0
    };
  }
  return {};
}

function collectMaterialTextureReferences(parsed) {
  const references = [];
  const materials = parsed?.materials;
  if (!Array.isArray(materials)) {
    return references;
  }

  materials.forEach((material, materialIndex) => {
    addMaterialTextureReference(references, material, materialIndex, "diffuse", "texturePath");
    addMaterialTextureReference(references, material, materialIndex, "sphere", "sphereTexturePath");
    if (!isBuiltInSharedToonReference(material) && !isBuiltInToonPath(material?.toonTexturePath)) {
      addMaterialTextureReference(references, material, materialIndex, "toon", "toonTexturePath");
    }
  });
  return references;
}

function addMaterialTextureReference(references, material, materialIndex, textureKind, property) {
  const path = material?.[property];
  if (typeof path !== "string" || path.length === 0) {
    return;
  }
  references.push({
    path,
    normalizedPath: normalizeTexturePath(path),
    materialIndex,
    textureKind
  });
}

function isBuiltInSharedToonReference(material) {
  return material?.sharedToonIndex !== undefined && !material?.toonTexturePath;
}

function isBuiltInToonPath(path) {
  return typeof path === "string" && BUILT_IN_TOON_PATTERN.test(normalizeTexturePath(path));
}

async function createFixtureTextureResolver(modelDirectory, textureReferences, textureWarnings) {
  const textureIndex = await buildTextureIndex(modelDirectory);
  const referenceByNormalizedPath = new Map();
  const warnedNormalizedPaths = new Set();

  for (const reference of textureReferences) {
    const key = reference.normalizedPath.toLowerCase();
    if (!referenceByNormalizedPath.has(key)) {
      referenceByNormalizedPath.set(key, reference);
    }
  }

  return {
    async resolve(path) {
      const normalizedPath = normalizeTexturePath(path);
      const key = normalizedPath.toLowerCase();
      const resolved = textureIndex.get(key);
      if (resolved) {
        return resolved;
      }

      const reference = referenceByNormalizedPath.get(key);
      if (reference && !warnedNormalizedPaths.has(key)) {
        warnedNormalizedPaths.add(key);
        textureWarnings.push({
          path: reference.path,
          normalizedPath: reference.normalizedPath,
          materialIndex: reference.materialIndex,
          textureKind: reference.textureKind
        });
      }
      return undefined;
    }
  };
}

async function buildTextureIndex(modelDirectory) {
  const textureIndex = new Map();
  await indexTextureDirectory(modelDirectory, modelDirectory, textureIndex);
  return textureIndex;
}

async function indexTextureDirectory(rootDirectory, currentDirectory, textureIndex) {
  let entries;
  try {
    entries = await readdir(currentDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = resolve(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      await indexTextureDirectory(rootDirectory, absolutePath, textureIndex);
      continue;
    }
    if (!entry.isFile() || !TEXTURE_FILE_PATTERN.test(entry.name)) {
      continue;
    }

    const relativePath = normalizeTexturePath(relative(rootDirectory, absolutePath));
    addTextureIndexEntry(textureIndex, relativePath, absolutePath);
    addTextureIndexEntry(textureIndex, basename(relativePath), absolutePath);
  }
}

function addTextureIndexEntry(textureIndex, texturePath, absolutePath) {
  const key = normalizeTexturePath(texturePath).toLowerCase();
  if (!textureIndex.has(key)) {
    textureIndex.set(key, absolutePath);
  }
}

function normalizeTexturePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function createNodeTextureLoader() {
  return {
    load(_url, onLoad) {
      const texture = new THREE.Texture();
      onLoad(texture);
      return texture;
    }
  };
}

function summarizeThreeModel(model) {
  const materials = Array.isArray(model.mesh.material)
    ? model.mesh.material
    : [model.mesh.material].filter(Boolean);
  return {
    mesh: {
      name: model.mesh.name,
      isSkinnedMesh: model.mesh.isSkinnedMesh === true
    },
    geometry: {
      vertices: model.mesh.geometry.getAttribute("position")?.count ?? 0,
      indices: model.mesh.geometry.index?.count ?? 0
    },
    materials: materials.length,
    skeleton: {
      bones: model.mesh.skeleton?.bones?.length ?? 0
    },
    morphs: Object.keys(model.mesh.morphTargetDictionary ?? {}).length,
    outlineMeshes: model.outlineMeshes.length,
    renderOrderMeshes: model.renderOrderMeshes.length,
    textureDiagnostics: model.textureDiagnostics.length
  };
}

function disposeThreeModel(model) {
  const meshes = [model.mesh, ...model.outlineMeshes, ...model.renderOrderMeshes];
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  for (const mesh of meshes) {
    if (mesh.geometry) {
      geometries.add(mesh.geometry);
    }
    for (const material of normalizeMaterials(mesh.material)) {
      materials.add(material);
      collectMaterialTextures(material, textures);
    }
  }

  for (const texture of textures) {
    texture.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
  for (const geometry of geometries) {
    geometry.dispose();
  }
}

function normalizeMaterials(material) {
  if (Array.isArray(material)) {
    return material.filter(Boolean);
  }
  return material ? [material] : [];
}

function collectMaterialTextures(material, textures) {
  for (const value of Object.values(material)) {
    if (value?.isTexture) {
      textures.add(value);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
