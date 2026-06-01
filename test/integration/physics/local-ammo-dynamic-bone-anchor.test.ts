import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  AmmoMmdPhysicsBackend,
  ThreeMmdLoader,
  type AmmoNamespace
} from "../../../src/index.js";
import { legacyMmdEulerToQuaternion } from "../../../src/physics/legacyPhysicsBridge.js";

interface LocalAnchorFixtureResult {
  readonly skipReason?: string;
  readonly cases: readonly LocalAnchorPlaybackCase[];
  readonly skippedCases: readonly LocalAnchorSkippedCase[];
}

interface LocalAnchorPlaybackCase {
  readonly name: string;
  readonly modelPath: string;
  readonly motionPath?: string;
  readonly frames: readonly number[];
  readonly minParityDynamicWithBoneAnchorDelta: number;
}

interface LocalAnchorSkippedCase {
  readonly name: string;
  readonly reason: string;
}

interface AnchorFixtureDefinition {
  readonly name: string;
  readonly model: { readonly extension: "pmx" | "pmd"; readonly key: string };
  readonly motion: { readonly key: string };
  readonly frames: readonly number[];
  readonly minParityDynamicWithBoneAnchorDelta: number;
}

interface AnchorMetrics {
  readonly dynamicBodyCount: number;
  readonly dynamicWithBoneBodyCount: number;
  readonly rigidBodyCount: number;
  readonly rigidBodyTransformCount: number;
  readonly maxDynamicAnchorDelta: number;
  readonly maxDynamicWithBoneAnchorDelta: number;
  readonly worstDynamicAnchor: AnchorDeltaSample | null;
  readonly worstDynamicWithBoneAnchor: AnchorDeltaSample | null;
}

interface AnchorDeltaSample {
  readonly frame: number;
  readonly rigidBodyIndex: number;
  readonly bodyName: string;
  readonly boneName: string;
  readonly delta: number;
}

const localFixtureInventoryPath = "test/fixtures/fixtures.local.json";
const localHairOnlyFixturePath = resolve("..", "data", "unittest", "test_hair_physics.pmx");
const anchorFixtureDefinitions: readonly AnchorFixtureDefinition[] = [
  {
    name: "sour-miku-rabbithole",
    model: { extension: "pmx", key: "pmx020" },
    motion: { key: "vmd109" },
    frames: [60, 90, 120, 180, 240],
    minParityDynamicWithBoneAnchorDelta: 0.5
  },
  {
    name: "tda-miku-addiction",
    model: { extension: "pmx", key: "pmx022" },
    motion: { key: "vmd044" },
    frames: [60, 90, 120, 180, 240],
    minParityDynamicWithBoneAnchorDelta: 0.25
  }
];

const localAnchorFixtures = await loadLocalAnchorFixtures();
const localHairOnlyFixtureExists = await fileExists(localHairOnlyFixturePath);

describe("local Ammo dynamic-with-bone anchor delta", () => {
  if (localAnchorFixtures.skipReason) {
    it.skip(localAnchorFixtures.skipReason, () => {});
    return;
  }

  for (const skippedCase of localAnchorFixtures.skippedCases) {
    it.skip(`${skippedCase.name}: ${skippedCase.reason}`, () => {});
  }

  for (const playbackCase of localAnchorFixtures.cases) {
    it(
      `keeps dynamic anchors aligned and documents visual correction for ${playbackCase.name}`,
      async () => {
        const ammoModule = await import("ammo.js");
        const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;

        const parity = await collectAnchorMetrics(Ammo, playbackCase, 0);
        const visual = await collectAnchorMetrics(Ammo, playbackCase, 1);

        expect(parity.dynamicBodyCount).toBeGreaterThan(0);
        expect(parity.dynamicWithBoneBodyCount).toBeGreaterThan(0);
        expect(parity.rigidBodyTransformCount).toBe(parity.rigidBodyCount);
        expect(visual.rigidBodyTransformCount).toBe(visual.rigidBodyCount);
        expect(
          parity.maxDynamicAnchorDelta,
          formatWorstAnchor("parity dynamic", parity.worstDynamicAnchor)
        ).toBeLessThan(0.005);
        expect(
          visual.maxDynamicAnchorDelta,
          formatWorstAnchor("visual dynamic", visual.worstDynamicAnchor)
        ).toBeLessThan(0.005);
        expect(
          parity.maxDynamicWithBoneAnchorDelta,
          formatWorstAnchor("parity dynamicWithBone", parity.worstDynamicWithBoneAnchor)
        ).toBeGreaterThan(playbackCase.minParityDynamicWithBoneAnchorDelta);
        expect(
          visual.maxDynamicWithBoneAnchorDelta,
          formatWorstAnchor("visual dynamicWithBone", visual.worstDynamicWithBoneAnchor)
        ).toBeLessThan(0.005);
        expect(visual.maxDynamicWithBoneAnchorDelta).toBeLessThan(
          parity.maxDynamicWithBoneAnchorDelta / 100
        );
      },
      40_000
    );
  }
});

describe("local Ammo hair-only dynamic-with-bone fixture", () => {
  if (!localHairOnlyFixtureExists) {
    it.skip(`local hair fixture not found: ${localHairOnlyFixturePath}`, () => {});
    return;
  }

  it("simulates the hair-only fixture after filtering invalid joints", async () => {
    const ammoModule = await import("ammo.js");
    const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
    const playbackCase = {
      name: "test_hair_physics",
      modelPath: localHairOnlyFixturePath,
      frames: [1, 2, 5, 10, 20, 30, 60],
      minParityDynamicWithBoneAnchorDelta: 0.05
    };

    const parity = await collectAnchorMetrics(Ammo, playbackCase, 0);
    const visual = await collectAnchorMetrics(Ammo, playbackCase, 1);

    expect(parity.rigidBodyCount).toBe(16);
    expect(parity.rigidBodyTransformCount).toBe(16);
    expect(parity.dynamicBodyCount).toBe(0);
    expect(parity.dynamicWithBoneBodyCount).toBe(14);
    expect(
      parity.maxDynamicWithBoneAnchorDelta,
      formatWorstAnchor("hair parity dynamicWithBone", parity.worstDynamicWithBoneAnchor)
    ).toBeGreaterThan(playbackCase.minParityDynamicWithBoneAnchorDelta);
    expect(
      parity.maxDynamicWithBoneAnchorDelta,
      formatWorstAnchor("hair parity dynamicWithBone", parity.worstDynamicWithBoneAnchor)
    ).toBeLessThan(0.2);
    expect(
      visual.maxDynamicWithBoneAnchorDelta,
      formatWorstAnchor("hair visual dynamicWithBone", visual.worstDynamicWithBoneAnchor)
    ).toBeLessThan(0.005);
  }, 40_000);
});

async function loadLocalAnchorFixtures(): Promise<LocalAnchorFixtureResult> {
  if (!await fileExists(localFixtureInventoryPath)) {
    return {
      skipReason: `local fixture inventory not found: ${localFixtureInventoryPath}`,
      cases: [],
      skippedCases: []
    };
  }

  const inventory = JSON.parse(await readFile(localFixtureInventoryPath, "utf8")) as {
    readonly basePath?: string;
    readonly paths?: {
      readonly releaseSmoke?: {
        readonly byExtension?: {
          readonly pmx?: Record<string, string>;
          readonly pmd?: Record<string, string>;
          readonly vmd?: Record<string, string>;
        };
      };
    };
  };
  const inventoryDir = dirname(resolve(localFixtureInventoryPath));
  const basePath = resolve(inventoryDir, inventory.basePath ?? ".");
  const cases: LocalAnchorPlaybackCase[] = [];
  const skippedCases: LocalAnchorSkippedCase[] = [];

  for (const definition of anchorFixtureDefinitions) {
    const modelPath = inventory.paths?.releaseSmoke?.byExtension?.[definition.model.extension]?.[definition.model.key];
    const motionPath = inventory.paths?.releaseSmoke?.byExtension?.vmd?.[definition.motion.key];
    if (!modelPath || !motionPath) {
      skippedCases.push({
        name: definition.name,
        reason: `missing fixture keys ${definition.model.extension}.${definition.model.key} or vmd.${definition.motion.key}`
      });
      continue;
    }
    const resolvedCase: LocalAnchorPlaybackCase = {
      name: definition.name,
      modelPath: resolve(basePath, modelPath),
      motionPath: resolve(basePath, motionPath),
      frames: definition.frames,
      minParityDynamicWithBoneAnchorDelta: definition.minParityDynamicWithBoneAnchorDelta
    };
    const missingPath = await firstMissingPath([resolvedCase.modelPath, resolvedCase.motionPath]);
    if (missingPath) {
      skippedCases.push({
        name: definition.name,
        reason: `missing ${missingPath}`
      });
      continue;
    }
    cases.push(resolvedCase);
  }

  return {
    skipReason:
      cases.length === 0 && skippedCases.length > 0
        ? `all local anchor fixtures are unavailable (${skippedCases
            .map((skippedCase) => `${skippedCase.name}: ${skippedCase.reason}`)
            .join("; ")})`
        : undefined,
    cases,
    skippedCases
  };
}

async function collectAnchorMetrics(
  Ammo: AmmoNamespace,
  playbackCase: LocalAnchorPlaybackCase,
  dynamicWithBoneTranslationFeedbackScale: number
): Promise<AnchorMetrics> {
  const physicsBackend = new AmmoMmdPhysicsBackend(Ammo, {
    dynamicWithBoneTranslationFeedbackScale,
    resetCatchUpSteps: 0,
    solverIterations: 20
  });
  const loader = new ThreeMmdLoader({
    runtime: {
      frameRate: 30,
      physics: "external",
      physicsBackend
    }
  });
  try {
    const model = await loader.loadModel(await readFile(playbackCase.modelPath), {
      outline: false,
      materialRenderOrder: false
    });
    const motion = playbackCase.motionPath
      ? await loader.loadAnimation(await readFile(playbackCase.motionPath))
      : { animation: createRestPoseAnimation() };
    const runtime = model.runtime;
    if (!runtime) {
      throw new Error("ThreeMmdLoader did not create a runtime");
    }
    runtime.setAnimation(motion.animation, model.mesh);

    const metrics = {
      dynamicBodyCount: 0,
      dynamicWithBoneBodyCount: 0,
      rigidBodyCount: 0,
      rigidBodyTransformCount: 0,
      maxDynamicAnchorDelta: 0,
      maxDynamicWithBoneAnchorDelta: 0,
      worstDynamicAnchor: null as AnchorDeltaSample | null,
      worstDynamicWithBoneAnchor: null as AnchorDeltaSample | null
    };

    for (const frame of playbackCase.frames) {
      runtime.tick(frame / 30, { mesh: model.mesh });
      const frameMetrics = collectFrameAnchorMetrics(model.mesh, runtime, frame);
      metrics.dynamicBodyCount = Math.max(metrics.dynamicBodyCount, frameMetrics.dynamicBodyCount);
      metrics.dynamicWithBoneBodyCount = Math.max(
        metrics.dynamicWithBoneBodyCount,
        frameMetrics.dynamicWithBoneBodyCount
      );
      metrics.rigidBodyCount = Math.max(metrics.rigidBodyCount, frameMetrics.rigidBodyCount);
      metrics.rigidBodyTransformCount = Math.max(
        metrics.rigidBodyTransformCount,
        frameMetrics.rigidBodyTransformCount
      );
      metrics.maxDynamicAnchorDelta = Math.max(
        metrics.maxDynamicAnchorDelta,
        frameMetrics.maxDynamicAnchorDelta
      );
      metrics.maxDynamicWithBoneAnchorDelta = Math.max(
        metrics.maxDynamicWithBoneAnchorDelta,
        frameMetrics.maxDynamicWithBoneAnchorDelta
      );
      metrics.worstDynamicAnchor = worstAnchor(
        metrics.worstDynamicAnchor,
        frameMetrics.worstDynamicAnchor
      );
      metrics.worstDynamicWithBoneAnchor = worstAnchor(
        metrics.worstDynamicWithBoneAnchor,
        frameMetrics.worstDynamicWithBoneAnchor
      );
    }

    return metrics;
  } finally {
    physicsBackend.dispose();
  }
}

function collectFrameAnchorMetrics(
  mesh: THREE.SkinnedMesh,
  runtime: NonNullable<Awaited<ReturnType<ThreeMmdLoader["loadModel"]>>["runtime"]>,
  frame: number
): AnchorMetrics {
  const rigidBodies = mesh.userData.mmdPhysics?.rigidBodies ?? [];
  const rigidBodyWorldMatrices = runtime.debugRigidBodyWorldTransformsColumnMajor?.() ?? [];
  const boneWorldMatrices = runtime.debugState().stages.physics.worldMatricesColumnMajor;
  const metrics = {
    dynamicBodyCount: 0,
    dynamicWithBoneBodyCount: 0,
    rigidBodyCount: rigidBodies.length,
    rigidBodyTransformCount: rigidBodyWorldMatrices.length,
    maxDynamicAnchorDelta: 0,
    maxDynamicWithBoneAnchorDelta: 0,
    worstDynamicAnchor: null as AnchorDeltaSample | null,
    worstDynamicWithBoneAnchor: null as AnchorDeltaSample | null
  };

  expect(rigidBodyWorldMatrices.length).toBe(rigidBodies.length);

  for (let bodyIndex = 0; bodyIndex < Math.min(rigidBodies.length, rigidBodyWorldMatrices.length); bodyIndex += 1) {
    const body = rigidBodies[bodyIndex];
    const boneIndex = Number(body?.boneIndex ?? -1);
    const bone = mesh.skeleton.bones[boneIndex];
    const restPosition = bone?.userData.mmdRestPosition;
    const bodyWorldMatrix = rigidBodyWorldMatrices[bodyIndex];
    const boneWorldMatrix = boneWorldMatrices?.slice(boneIndex * 16, boneIndex * 16 + 16);
    if (
      !body ||
      !bone ||
      !Array.isArray(restPosition) ||
      !bodyWorldMatrix ||
      !boneWorldMatrix ||
      boneWorldMatrix.length < 16
    ) {
      continue;
    }

    const delta = calculateAnchorDelta(body, restPosition, bodyWorldMatrix, boneWorldMatrix);
    const sample = {
      frame,
      rigidBodyIndex: bodyIndex,
      bodyName: readableName(body.name),
      boneName: readableName(bone.name),
      delta
    };
    if (body.mode === "dynamic") {
      metrics.dynamicBodyCount += 1;
      metrics.maxDynamicAnchorDelta = Math.max(metrics.maxDynamicAnchorDelta, delta);
      metrics.worstDynamicAnchor = worstAnchor(metrics.worstDynamicAnchor, sample);
    } else if (body.mode === "dynamicBone") {
      metrics.dynamicWithBoneBodyCount += 1;
      metrics.maxDynamicWithBoneAnchorDelta = Math.max(metrics.maxDynamicWithBoneAnchorDelta, delta);
      metrics.worstDynamicWithBoneAnchor = worstAnchor(
        metrics.worstDynamicWithBoneAnchor,
        sample
      );
    }
  }

  return metrics;
}

function worstAnchor(
  current: AnchorDeltaSample | null,
  candidate: AnchorDeltaSample | null
): AnchorDeltaSample | null {
  if (!candidate) {
    return current;
  }
  if (!current || candidate.delta > current.delta) {
    return candidate;
  }
  return current;
}

function formatWorstAnchor(label: string, sample: AnchorDeltaSample | null): string {
  if (!sample) {
    return `${label}: no anchor samples`;
  }
  return [
    `${label}: delta=${sample.delta}`,
    `frame=${sample.frame}`,
    `rigidBody=${sample.rigidBodyIndex}:${sample.bodyName}`,
    `bone=${sample.boneName}`
  ].join(" ");
}

function readableName(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "(unnamed)";
}

function createRestPoseAnimation(): Parameters<NonNullable<Awaited<ReturnType<ThreeMmdLoader["loadModel"]>>["runtime"]>["setAnimation"]>[0] {
  return {
    kind: "vmd",
    metadata: {
      format: "vmd",
      modelName: "",
      counts: { bones: 0, morphs: 0, cameras: 0, lights: 0, selfShadows: 0, properties: 0 },
      maxFrame: 1
    },
    boneTracks: {},
    morphTracks: {},
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
}

function calculateAnchorDelta(
  body: {
    readonly position?: readonly number[];
    readonly rotation?: readonly number[];
  },
  restPosition: readonly number[],
  bodyWorldMatrix: readonly number[],
  boneWorldMatrix: readonly number[]
): number {
  const bodyWorld = decomposeMmdMatrix(bodyWorldMatrix);
  const boneWorld = decomposeMmdMatrix(boneWorldMatrix);
  const offsetRotation = new THREE.Quaternion(
    ...legacyMmdEulerToQuaternion(tuple3(body.rotation ?? [0, 0, 0]))
  );
  const boneRotation = bodyWorld.rotation.multiply(offsetRotation.invert());
  const offset = new THREE.Vector3(
    (body.position?.[0] ?? 0) - restPosition[0],
    (body.position?.[1] ?? 0) - restPosition[1],
    (body.position?.[2] ?? 0) - restPosition[2]
  );
  const expectedBonePosition = bodyWorld.position.sub(offset.applyQuaternion(boneRotation));
  return expectedBonePosition.distanceTo(boneWorld.position);
}

function decomposeMmdMatrix(matrix: readonly number[]): {
  readonly position: THREE.Vector3;
  readonly rotation: THREE.Quaternion;
} {
  const threeMatrix = new THREE.Matrix4().fromArray(Array.from(matrix));
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  threeMatrix.decompose(position, rotation, scale);
  return { position, rotation };
}

function tuple3(values: readonly number[]): [number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

async function firstMissingPath(paths: readonly string[]): Promise<string | undefined> {
  for (const path of paths) {
    if (!await fileExists(path)) {
      return path;
    }
  }
  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
