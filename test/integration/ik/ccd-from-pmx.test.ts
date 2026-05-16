import { describe, expect, it } from "vitest";

import {
  CcdIkSolver,
  createCcdIkSolveInputFromMmdIk,
  type MmdIkRuntimeChain
} from "../../../src/runtime/index.js";
import { parseLoaderMmdModelData } from "../../../src/three/modelAssembly.js";
import { loadFixtureBytes } from "../../helpers/fixtures.js";

interface FixtureBoneIkLink {
  readonly boneIndex: number;
  readonly limits?: {
    readonly lower: readonly [number, number, number];
    readonly upper: readonly [number, number, number];
  };
}

interface FixtureBoneIk {
  readonly targetIndex: number;
  readonly loopCount: number;
  readonly limitAngle: number;
  readonly links: readonly FixtureBoneIkLink[];
}

interface FixtureSkeletonBone {
  readonly parentIndex: number;
  readonly position: readonly [number, number, number];
  readonly ik?: FixtureBoneIk;
}

describe("CCD IK PMX fixture integration", () => {
  it("runs CcdIkSolver from a PMX IK chain with finite results", async () => {
    const bytes = await loadFixtureBytes("test_basic_bone.pmx");
    const modelData = parseLoaderMmdModelData(bytes);
    const bones = modelData.skeleton.bones as readonly FixtureSkeletonBone[];
    const ikBoneIndex = bones.findIndex((bone) => bone.ik !== undefined);
    const ikBone = bones[ikBoneIndex];

    expect(ikBone?.ik).toBeDefined();

    if (!ikBone?.ik) {
      return;
    }

    const input = createCcdIkSolveInputFromMmdIk({
      bones: bones.map((bone) => ({
        parentIndex: bone.parentIndex,
        translation: [bone.position[0], bone.position[1], bone.position[2]]
      })),
      pose: {
        rotations: bones.map(() => [0, 0, 0, 1])
      },
      chains: [createRuntimeIkChain(ikBoneIndex, ikBone.ik)]
    });

    const result = new CcdIkSolver().solve(input);

    expect(result.finalDistances.every(Number.isFinite)).toBe(true);
    expect(input.pose.rotations.flat().every(Number.isFinite)).toBe(true);
  });
});

function createRuntimeIkChain(boneIndex: number, ik: FixtureBoneIk): MmdIkRuntimeChain {
  return {
    boneIndex,
    targetBoneIndex: ik.targetIndex,
    links: ik.links.map((link) => ({
      boneIndex: link.boneIndex,
      angleLimit: link.limits
        ? {
            minimumAngle: [
              link.limits.lower[0],
              link.limits.lower[1],
              link.limits.lower[2]
            ],
            maximumAngle: [
              link.limits.upper[0],
              link.limits.upper[1],
              link.limits.upper[2]
            ]
          }
        : undefined
    })),
    iterationCount: ik.loopCount,
    maxAnglePerIteration: ik.limitAngle
  };
}
