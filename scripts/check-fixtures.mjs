#!/usr/bin/env node
// Run every PMD / PMX / VMD / VPD path listed in a fixture inventory through the
// full parsers in `dist/`. Reports per-file pass / fail / warning diagnostics
// and writes a JSON report to tmp/fixture-parse-report.json.
// Defaults to the in-repo sample inventory at test/fixtures/fixtures.sample.json.
//
// Usage:
//   node scripts/check-fixtures.mjs                 # run all categories from the in-repo sample
//   node scripts/check-fixtures.mjs pmx vmd         # subset by category
//   node scripts/check-fixtures.mjs --limit 20      # limit per category
//   node scripts/check-fixtures.mjs --bail          # stop at first failure
//   node scripts/check-fixtures.mjs --no-three      # parse only, skip PMX/PMD Three.js assembly
//   node scripts/check-fixtures.mjs --physics       # also smoke-test Ammo world init + one physics step
//   node scripts/check-fixtures.mjs --no-physics    # explicitly disable the physics stage
//   node scripts/check-fixtures.mjs ../data/fixtures.json
//   node scripts/check-fixtures.mjs --limit 20 ../data/fixtures.json
//   FIXTURES_JSON=path/to/fixtures.json node ...    # override fixture index

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";

import { parsePmd } from "../dist/parser/model/PmdModelParser.js";
import { parsePmx } from "../dist/parser/model/PmxModelParser.js";
import { parseVmd } from "../dist/parser/vmd/VmdParser.js";
import { parseVpdPose } from "../dist/parser/vpd/VpdMetadataParser.js";
import { createAmmoMmdPhysicsBackend, validateConcreteMmdPhysicsStepContext } from "../dist/physics/index.js";
import { ThreeMmdLoader } from "../dist/three/index.js";
import { parseLoaderMmdModelData } from "../dist/three/modelAssembly.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const defaultFixturesPath = resolve(projectRoot, "test", "fixtures", "fixtures.sample.json");

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
    three: true,
    physics: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--bail") {
      args.bail = true;
    } else if (value === "--no-three") {
      args.three = false;
    } else if (value === "--physics") {
      args.physics = true;
    } else if (value === "--no-physics") {
      args.physics = false;
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
  // Local corpus inventories are gitignored and absent on fresh clones / CI;
  // treat a missing inventory as an opt-in skip rather than an error.
  if (!existsSync(fixturesPath)) {
    console.log(`Inventory not found, skipping: ${relative(projectRoot, fixturesPath)}`);
    return;
  }
  const fixtures = JSON.parse(await readFile(fixturesPath, "utf8"));
  const fixturesRoot = typeof fixtures.basePath === "string"
    ? resolve(dirname(fixturesPath), fixtures.basePath)
    : resolve(dirname(fixturesPath), "..");
  const byExtension = fixtures?.paths?.releaseSmoke?.byExtension ?? {};

  const results = { startedAt: new Date().toISOString(), categories: {} };
  let totalChecked = 0;
  let totalFailed = 0;
  const physicsRuntime = createPhysicsRuntime();

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
      if (args.physics) {
        record.physics = createSkippedPhysicsSummary("not applicable");
      }
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
        if (THREE_MODEL_CATEGORIES.has(category)) {
          const invariantViolations = checkModelInvariants(parsed);
          if (invariantViolations.length > 0) {
            record.diagnostics = [
              ...(Array.isArray(record.diagnostics) ? record.diagnostics : []),
              ...invariantViolations
            ];
            if (record.status !== "fail") {
              record.status = "warn-errors";
            }
          }
        }
        let modelData;
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
          if (args.physics) {
            modelData = parseLoaderMmdModelData(buffer);
          }
        }
        if (args.physics) {
          record.physics = await runPhysicsStage({
            category,
            buffer,
            modelData,
            threeEnabled: args.three,
            physicsRuntime,
            record
          });
        }
        record.elapsedMs = +(performance.now() - start).toFixed(2);
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
      }
      if (record.status === "fail") {
        summary.failed += 1;
        totalFailed += 1;
      } else {
        summary.passed += 1;
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
        if (Array.isArray(record.diagnostics)) {
          for (const diagnostic of record.diagnostics) {
            console.log(`     ~ ${diagnostic.level}/${diagnostic.code}: ${diagnostic.message}`);
          }
        }
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
        if (record.physics?.attempted === true) {
          console.log(
            `     ~ physics: ${record.physics.rigidBodies} bodies, ${record.physics.joints} joints, ${record.physics.durationMs.toFixed(1)}ms`
          );
        } else if (args.physics && record.physics?.skipReason) {
          console.log(`     ~ physics: skipped (${record.physics.skipReason})`);
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

function createPhysicsRuntime() {
  return {
    state: "pending",
    Ammo: undefined,
    failure: undefined
  };
}

async function initializePhysicsRuntime(runtime) {
  if (runtime.state === "ready") {
    return runtime.Ammo;
  }
  if (runtime.state === "failed") {
    throw runtime.failure.error;
  }

  try {
    const ammoModule = await import("ammo.js");
    const ammoExport = ammoModule.default ?? ammoModule;
    const Ammo =
      typeof ammoExport === "function" && typeof ammoExport.btVector3 !== "function"
        ? await ammoExport()
        : ammoExport;
    runtime.state = "ready";
    runtime.Ammo = Ammo;
    return Ammo;
  } catch (error) {
    runtime.state = "failed";
    runtime.failure = {
      code: isAmmoHeapAllocationError(error)
        ? "PHYSICS_AMMO_HEAP_ALLOCATION_FAILED"
        : "PHYSICS_AMMO_INIT_FAILED",
      error
    };
    throw error;
  }
}

async function runPhysicsStage({
  category,
  buffer,
  modelData,
  threeEnabled,
  physicsRuntime,
  record
}) {
  if (!THREE_MODEL_CATEGORIES.has(category)) {
    return createSkippedPhysicsSummary("non-model fixture");
  }
  if (!threeEnabled) {
    return createSkippedPhysicsSummary("three disabled");
  }
  if (physicsRuntime.state === "failed") {
    addPhysicsDiagnostic(record, physicsRuntime.failure.code, physicsRuntime.failure.error);
    return createSkippedPhysicsSummary("ammo init failed", modelData);
  }

  const start = performance.now();
  let Ammo;
  try {
    Ammo = await initializePhysicsRuntime(physicsRuntime);
  } catch (error) {
    addPhysicsDiagnostic(record, physicsRuntime.failure.code, error);
    return {
      ...createSkippedPhysicsSummary("ammo init failed", modelData),
      durationMs: +(performance.now() - start).toFixed(2)
    };
  }

  const resolvedModelData = modelData ?? parseLoaderMmdModelData(buffer);
  const context = createMinimalPhysicsStepContext(resolvedModelData);
  const validation = validateConcreteMmdPhysicsStepContext(context);
  if (!validation.valid) {
    const error = new Error(
      `Invalid fixture physics step context: ${validation.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`
    );
    addPhysicsDiagnostic(record, "PHYSICS_WORLD_INIT_FAILED", error);
    return createAttemptedPhysicsSummary(start, resolvedModelData, Ammo);
  }

  const backend = createAmmoMmdPhysicsBackend(Ammo);
  try {
    context.seconds = 0;
    context.deltaSeconds = 0;
    context.frame = 0;
    backend.step(context);
  } catch (error) {
    addPhysicsDiagnostic(record, "PHYSICS_WORLD_INIT_FAILED", error);
    backend.dispose?.();
    return createAttemptedPhysicsSummary(start, resolvedModelData, Ammo);
  }

  try {
    context.seconds = 1 / 60;
    context.deltaSeconds = 1 / 60;
    context.frame = 1;
    backend.step(context);
  } catch (error) {
    addPhysicsDiagnostic(record, "PHYSICS_STEP_FAILED", error);
  } finally {
    backend.dispose?.();
  }

  return createAttemptedPhysicsSummary(start, resolvedModelData, Ammo);
}

function createSkippedPhysicsSummary(skipReason, modelData) {
  return {
    attempted: false,
    durationMs: 0,
    rigidBodies: modelData?.rigidBodies?.length ?? 0,
    joints: modelData?.joints?.length ?? 0,
    ammoHeapBytes: null,
    skipReason
  };
}

function createAttemptedPhysicsSummary(start, modelData, Ammo) {
  return {
    attempted: true,
    durationMs: +(performance.now() - start).toFixed(2),
    rigidBodies: modelData?.rigidBodies?.length ?? 0,
    joints: modelData?.joints?.length ?? 0,
    ammoHeapBytes: getAmmoHeapBytes(Ammo)
  };
}

function addPhysicsDiagnostic(record, code, error) {
  record.status = "fail";
  record.diagnostics = [
    ...(Array.isArray(record.diagnostics) ? record.diagnostics : []),
    {
      level: "error",
      code,
      message: error?.message ?? String(error)
    }
  ];
  record.error = {
    name: error?.name ?? "Error",
    message: `${code}: ${error?.message ?? String(error)}`,
    stack: error?.stack?.split("\n").slice(0, 4).join("\n")
  };
}

function isAmmoHeapAllocationError(error) {
  return error?.name === "RangeError" && /allocation/i.test(error?.message ?? "");
}

function getAmmoHeapBytes(Ammo) {
  return Ammo?.HEAPU8?.buffer?.byteLength ?? Ammo?.HEAP8?.buffer?.byteLength ?? null;
}

function createMinimalPhysicsStepContext(modelData) {
  const boneCount = modelData.skeleton.bones.length;
  const inputTranslations = new Float32Array(boneCount * 3);
  const inputRotations = new Float32Array(boneCount * 4);
  const inputWorldMatricesColumnMajor = new Float32Array(boneCount * 16);

  modelData.skeleton.bones.forEach((bone, index) => {
    const translationOffset = index * 3;
    inputTranslations[translationOffset] = bone.position[0];
    inputTranslations[translationOffset + 1] = bone.position[1];
    inputTranslations[translationOffset + 2] = bone.position[2];

    const rotationOffset = index * 4;
    inputRotations[rotationOffset] = 0;
    inputRotations[rotationOffset + 1] = 0;
    inputRotations[rotationOffset + 2] = 0;
    inputRotations[rotationOffset + 3] = 1;

    writeIdentityMatrix(inputWorldMatricesColumnMajor, index, bone.position);
  });

  const context = {
    seconds: 1 / 60,
    deltaSeconds: 1 / 60,
    frame: 1,
    frameRate: 60,
    skeleton: {
      bones: modelData.skeleton.bones.map((bone, index) => ({
        index,
        name: bone.englishName || bone.name,
        parentIndex: bone.parentIndex,
        restTranslation: [bone.position[0], bone.position[1], bone.position[2]],
        restRotation: [0, 0, 0, 1]
      }))
    },
    rigidBodies: modelData.rigidBodies
      .filter((rigidBody) => rigidBody.shape !== "unknown" && rigidBody.mode !== "unknown")
      .map((rigidBody, index) => ({
        index,
        name: rigidBody.englishName || rigidBody.name,
        boneIndex: rigidBody.boneIndex,
        motionType: rigidBody.mode === "dynamicBone" ? "dynamicWithBone" : rigidBody.mode,
        shape: {
          type: rigidBody.shape,
          size: rigidBody.size
        },
        localTranslation: rigidBody.position,
        localRotation: eulerXyzToQuaternion(rigidBody.rotation),
        mass: rigidBody.mass,
        linearDamping: rigidBody.linearDamping,
        angularDamping: rigidBody.angularDamping,
        restitution: rigidBody.restitution,
        friction: rigidBody.friction,
        collisionGroup: rigidBody.group,
        collisionMask: rigidBody.mask
      })),
    joints: modelData.joints.map((joint, index) => ({
      index,
      name: joint.englishName || joint.name,
      rigidBodyIndexA: joint.rigidBodyIndexA,
      rigidBodyIndexB: joint.rigidBodyIndexB,
      translation: joint.position,
      rotation: eulerXyzToQuaternion(joint.rotation),
      linearLimit: {
        lower: joint.translationLowerLimit,
        upper: joint.translationUpperLimit
      },
      angularLimit: {
        lower: joint.rotationLowerLimit,
        upper: joint.rotationUpperLimit
      },
      spring: {
        linear: joint.springTranslationFactor,
        angular: joint.springRotationFactor
      }
    })),
    inputTranslations,
    inputRotations,
    inputWorldMatricesColumnMajor,
    output: {
      translations: new Float32Array(inputTranslations),
      rotations: new Float32Array(inputRotations),
      worldMatricesColumnMajor: new Float32Array(inputWorldMatricesColumnMajor),
      updatedBoneIndices: []
    }
  };

  return context;
}

function writeIdentityMatrix(buffer, index, translation) {
  const offset = index * 16;
  buffer[offset] = 1;
  buffer[offset + 5] = 1;
  buffer[offset + 10] = 1;
  buffer[offset + 12] = translation[0];
  buffer[offset + 13] = translation[1];
  buffer[offset + 14] = translation[2];
  buffer[offset + 15] = 1;
}

function eulerXyzToQuaternion(euler) {
  const halfX = euler[0] * 0.5;
  const halfY = euler[1] * 0.5;
  const halfZ = euler[2] * 0.5;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);
  const rotation = [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  ];
  const length = Math.hypot(...rotation) || 1;
  return [
    rotation[0] / length,
    rotation[1] / length,
    rotation[2] / length,
    rotation[3] / length
  ];
}

// Cross-check parsed PMX/PMD array lengths against the metadata counts. A
// consistent parser must keep typed-array sizes in lock-step with the reported
// counts; a mismatch on a real-world model is a parser regression, so surface
// it as an error-level diagnostic (visible, but does not abort the run).
function checkModelInvariants(parsed) {
  const counts = parsed?.metadata?.counts;
  const geometry = parsed?.geometry;
  if (!counts || !geometry) {
    return [];
  }

  const violations = [];
  const expect = (label, actual, expected) => {
    if (typeof actual === "number" && actual !== expected) {
      violations.push({
        level: "error",
        code: "GEOMETRY_COUNT_MISMATCH",
        message: `${label}: expected ${expected}, got ${actual}`
      });
    }
  };
  const vertices = counts.vertices ?? 0;

  expect("positions", geometry.positions?.length, vertices * 3);
  expect("normals", geometry.normals?.length, vertices * 3);
  expect("uvs", geometry.uvs?.length, vertices * 2);
  expect("skinIndices", geometry.skinIndices?.length, vertices * 4);
  expect("skinWeights", geometry.skinWeights?.length, vertices * 4);
  expect("indices", geometry.indices?.length, (counts.faces ?? 0) * 3);
  expect("materials", parsed?.materials?.length, counts.materials ?? 0);
  expect("bones", parsed?.skeleton?.bones?.length, counts.bones ?? 0);
  expect("morphs", parsed?.morphs?.length, counts.morphs ?? 0);
  expect("rigidBodies", parsed?.rigidBodies?.length, counts.rigidBodies ?? 0);
  expect("joints", parsed?.joints?.length, counts.joints ?? 0);

  return violations;
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
