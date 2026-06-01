import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  AmmoMmdPhysicsBackend,
  ThreeMmdLoader,
  type AmmoPhysicsBackendOptions,
  type AmmoNamespace
} from "../../../src/index.js";
import { loadLocalPlaybackFixtures, type LocalPlaybackCase } from "../../helpers/localPlaybackFixtures.js";

const playbackFixtures = await loadLocalPlaybackFixtures();

describe("local Ammo playback physics stability", () => {
  if (playbackFixtures.skipReason) {
    it.skip(playbackFixtures.skipReason, () => {});
    return;
  }

  const playbackCase = selectPhysicsPlaybackCase(playbackFixtures.cases);
  if (!playbackCase) {
    it.skip("no local playback case with dense MMD physics data is available", () => {});
    return;
  }

  it(
    `keeps rigid-body playback finite and bounded for ${playbackCase.name}`,
    async () => {
      const ammoModule = await import("ammo.js");
      const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
      const metrics = await collectPlaybackMetrics(Ammo, playbackCase, 120);

      expect(metrics.sampledFrameCount).toBe(121);
      expect(metrics.maxRigidBodyStepDistance).toBeLessThan(8);
      expect(metrics.maxRigidBodyTranslationAbs).toBeLessThan(200);
    },
    20_000
  );

  it(
    `keeps contact penetration bounded for ${playbackCase.name}`,
    async () => {
      const ammoModule = await import("ammo.js");
      const Ammo = (ammoModule.default ?? ammoModule) as AmmoNamespace;
      const metrics = await collectPlaybackMetrics(Ammo, playbackCase, 120);

      expect(metrics.sampledFrameCount).toBe(121);
      expect(metrics.maxContactPenetration).toBeLessThan(0.8);
      expect(metrics.deepContactFrameCount).toBeLessThan(20);
    },
    20_000
  );
});

interface PlaybackPhysicsMetrics {
  readonly sampledFrameCount: number;
  readonly maxRigidBodyStepDistance: number;
  readonly maxRigidBodyTranslationAbs: number;
  readonly maxContactPenetration: number;
  readonly deepContactFrameCount: number;
}

async function collectPlaybackMetrics(
  Ammo: AmmoNamespace,
  playbackCase: LocalPlaybackCase,
  maxFrame: number,
  options: AmmoPhysicsBackendOptions = {}
): Promise<PlaybackPhysicsMetrics> {
  const physicsBackend = new AmmoMmdPhysicsBackend(Ammo, {
    solverIterations: 20,
    resetCatchUpSteps: 0,
    ...options
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
    const motion = await loader.loadAnimation(await readFile(playbackCase.motionPath));
    const runtime = model.runtime;
    if (!runtime) {
      throw new Error("ThreeMmdLoader did not create a runtime");
    }
    runtime.setAnimation(motion.animation, model.mesh);

    let previousTransforms: readonly (readonly number[])[] | undefined;
    let maxRigidBodyStepDistance = 0;
    let maxRigidBodyTranslationAbs = 0;
    let maxContactPenetration = 0;
    let deepContactFrameCount = 0;
    let sampledFrameCount = 0;

    for (let frame = 0; frame <= maxFrame; frame += 1) {
      runtime.evaluate(frame / 30);
      const transforms = runtime.debugRigidBodyWorldTransformsColumnMajor?.() ?? [];
      expect(transforms.length).toBeGreaterThan(0);
      for (const matrix of transforms) {
        expect(Array.from(matrix).every(Number.isFinite)).toBe(true);
        maxRigidBodyTranslationAbs = Math.max(
          maxRigidBodyTranslationAbs,
          Math.abs(matrix[12]),
          Math.abs(matrix[13]),
          Math.abs(matrix[14])
        );
      }
      if (previousTransforms) {
        const count = Math.min(previousTransforms.length, transforms.length);
        for (let index = 0; index < count; index += 1) {
          const previous = previousTransforms[index];
          const current = transforms[index];
          if (!previous || !current) {
            continue;
          }
          maxRigidBodyStepDistance = Math.max(
            maxRigidBodyStepDistance,
            distance3(previous[12], previous[13], previous[14], current[12], current[13], current[14])
          );
        }
      }
      const frameContacts = physicsBackend.debugPhysicsContacts();
      const framePenetration = frameContacts.reduce(
        (max, contact) => Math.max(max, Math.max(-(contact.distance ?? 0), 0)),
        0
      );
      maxContactPenetration = Math.max(maxContactPenetration, framePenetration);
      if (framePenetration > 0.2) {
        deepContactFrameCount += 1;
      }
      previousTransforms = transforms.map((matrix) => Array.from(matrix));
      sampledFrameCount += 1;
    }

    return {
      sampledFrameCount,
      maxRigidBodyStepDistance,
      maxRigidBodyTranslationAbs,
      maxContactPenetration,
      deepContactFrameCount
    };
  } finally {
    physicsBackend.dispose();
  }
}

function selectPhysicsPlaybackCase(cases: readonly LocalPlaybackCase[]): LocalPlaybackCase | undefined {
  const physicsCaseNames = [
    "sour-miku-rabbithole",
    "tda-miku-togenrenka",
    "lat-miku-togenrenka"
  ];
  return physicsCaseNames
    .map((name) => cases.find((playbackCase) => playbackCase.name === name))
    .find((playbackCase): playbackCase is LocalPlaybackCase => playbackCase !== undefined);
}

function distance3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): number {
  return Math.hypot(bx - ax, by - ay, bz - az);
}
