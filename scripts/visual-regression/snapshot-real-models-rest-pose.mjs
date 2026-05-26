#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(__dirname, "real-models.manifest.json");
const outputRoot = path.join(repoRoot, "test-results", "visual", "real-models-rest-pose");
const supportedModes = new Set(["current", "baseline"]);
const dataRootEnvName = "MMD_DATA_ROOT";
const defaultWatchBones = ["センター", "腰", "下半身", "上半身", "左ひざ", "右ひざ", "左足", "右足"];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dataRoot = process.env[dataRootEnvName];
  if (!dataRoot) {
    console.log(`Real-model rest pose snapshot skipped: ${dataRootEnvName} is not set.`);
    return;
  }

  const resolvedDataRoot = path.resolve(dataRoot);
  if (!existsSync(resolvedDataRoot)) {
    console.log(
      `Real-model rest pose snapshot skipped: ${dataRootEnvName} does not exist: ${resolvedDataRoot}`
    );
    return;
  }

  if (!existsSync(path.join(repoRoot, "dist", "three", "index.js"))) {
    throw new Error("dist/three/index.js is missing. Run npm run build before snapshotting.");
  }

  const manifest = await loadManifest(options.manifestPath);
  const selectedCases = selectCases(manifest.cases, options.caseName);
  const resolvedCases = resolveCases(selectedCases, resolvedDataRoot);
  if (resolvedCases.length === 0) {
    console.log("Real-model rest pose snapshot skipped: no cases with existing model assets.");
    return;
  }

  const outputDir = options.outputDir ?? path.join(outputRoot, options.mode);
  await mkdir(outputDir, { recursive: true });

  const { ThreeMmdLoader } = await import("../../dist/three/index.js");
  const snapshots = [];
  for (const visualCase of resolvedCases) {
    const snapshot = await snapshotCase(visualCase, ThreeMmdLoader);
    const filePath = path.join(outputDir, `${visualCase.name}.json`);
    await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
    snapshots.push({ name: visualCase.name, path: path.relative(repoRoot, filePath) });
  }

  console.log(`Wrote ${snapshots.length} real-model rest pose ${options.mode} snapshot(s).`);
  for (const snapshot of snapshots) {
    console.log(`${snapshot.name}: ${snapshot.path}`);
  }
}

function parseArgs(args) {
  const options = { mode: "current", caseName: undefined, outputDir: undefined, manifestPath };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--mode") {
      const mode = requireRawValue(args, (index += 1), arg);
      if (!supportedModes.has(mode)) {
        throw new Error(`--mode must be one of: ${Array.from(supportedModes).join(", ")}`);
      }
      options.mode = mode;
    } else if (arg === "--case") {
      options.caseName = requireRawValue(args, (index += 1), arg);
    } else if (arg === "--manifest") {
      options.manifestPath = path.resolve(requireRawValue(args, (index += 1), arg));
    } else if (arg === "--output-dir") {
      options.outputDir = path.resolve(requireRawValue(args, (index += 1), arg));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function loadManifest(filePath) {
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(manifest.cases)) {
    throw new Error("Real-model manifest must include a cases array");
  }
  return manifest;
}

function selectCases(cases, caseName) {
  if (caseName === undefined) {
    return cases;
  }
  const selected = cases.filter((visualCase) => visualCase.name === caseName);
  if (selected.length === 0) {
    throw new Error(`Unknown real-model case: ${caseName}`);
  }
  return selected;
}

function resolveCases(cases, dataRoot) {
  const resolvedCases = [];
  for (const visualCase of cases) {
    validateCase(visualCase);
    const modelPath = resolveAssetPath(dataRoot, visualCase.model);
    if (modelPath === undefined || !existsSync(modelPath)) {
      console.warn(`Skipping real-model rest pose case ${visualCase.name}: model not found.`);
      continue;
    }
    resolvedCases.push({
      ...visualCase,
      modelPath,
      watchBones: normalizeWatchBones(visualCase.watchBones)
    });
  }
  return resolvedCases;
}

function validateCase(visualCase) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(visualCase.name)) {
    throw new Error(`Real-model case name must be kebab-case: ${visualCase.name}`);
  }
  if (typeof visualCase.model !== "string" || visualCase.model.length === 0) {
    throw new Error(`Real-model case ${visualCase.name} must define model`);
  }
  if (visualCase.watchBones !== undefined && !Array.isArray(visualCase.watchBones)) {
    throw new Error(`Real-model case ${visualCase.name} watchBones must be an array`);
  }
}

function normalizeWatchBones(watchBones) {
  if (watchBones === undefined) {
    return defaultWatchBones;
  }
  return watchBones.filter((boneName) => typeof boneName === "string" && boneName.length > 0);
}

function resolveAssetPath(dataRoot, relativePath) {
  if (path.isAbsolute(relativePath)) {
    return undefined;
  }
  const resolved = path.resolve(dataRoot, relativePath);
  return isInsideRoot(resolved, dataRoot) ? resolved : undefined;
}

async function snapshotCase(visualCase, ThreeMmdLoader) {
  const bytes = await readFile(visualCase.modelPath);
  const loader = new ThreeMmdLoader({
    textureLoader: createNoopTextureLoader(),
    runtime: { physics: "none" }
  });
  const model = await loader.loadModel(bytes);
  model.runtime?.setAnimation(createEmptyMmdClip("rest-pose"), model.mesh);
  model.runtime?.evaluate(0, { physics: false, ik: false });
  model.mesh.updateMatrixWorld(true);

  const bones = {};
  for (const boneName of visualCase.watchBones) {
    const bone = findBone(model.mesh, boneName);
    if (!bone) {
      bones[boneName] = { found: false };
      continue;
    }
    const entry = {
      found: true,
      localQuaternion: roundQuaternion(bone.quaternion)
    };
    if (!(bone.parent instanceof THREE.Bone)) {
      entry.worldQuaternion = roundQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
    }
    bones[boneName] = entry;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    case: visualCase.name,
    model: visualCase.model,
    watchBones: visualCase.watchBones,
    bones
  };
}

function findBone(mesh, boneName) {
  return mesh.skeleton.bones.find(
    (bone) =>
      bone.userData.mmdBoneName === boneName ||
      bone.userData.mmdEnglishBoneName === boneName ||
      bone.name === boneName
  );
}

function roundQuaternion(quaternion) {
  return {
    x: roundComponent(quaternion.x),
    y: roundComponent(quaternion.y),
    z: roundComponent(quaternion.z),
    w: roundComponent(quaternion.w)
  };
}

function roundComponent(value) {
  return Number(value.toFixed(8));
}

function createEmptyMmdClip(name) {
  const clip = new THREE.AnimationClip(name, 0, []);
  clip.userData = {
    mmdAnimation: {
      kind: "vmd",
      metadata: { format: "vmd", modelName: "", counts: {}, maxFrame: 0 },
      boneTracks: {},
      morphTracks: {},
      cameraFrames: [],
      lightFrames: [],
      selfShadowFrames: [],
      propertyFrames: []
    }
  };
  return clip;
}

function createNoopTextureLoader() {
  return {
    load(_url, onLoad) {
      const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      texture.needsUpdate = true;
      Promise.resolve().then(() => onLoad?.(texture));
      return texture;
    }
  };
}

function isInsideRoot(filePath, root) {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function requireRawValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

await main();
