import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createThreeAnimationClip, createThreePoseAnimationClip } from "../../../src/three/index.js";
import type { MmdAnimation, MmdPose } from "../../../src/parser/model/modelTypes.js";

describe("createThreeAnimationClip", () => {
  it("adds MMD translation offsets to the Three.js rest local position", () => {
    const bone = new THREE.Bone();
    bone.name = "center";
    bone.position.set(1, 2, -3);
    bone.userData.mmdBoneName = "センター";

    const clip = createThreeAnimationClip(createAnimation("センター"), [bone]);
    const positionTrack = clip.tracks.find((track) => track.name === ".bones[center].position");

    expect(Array.from(positionTrack?.values ?? [])).toEqual([5, 7, -9]);
  });

  it("converts MMD quaternions into the Three.js Z-flipped coordinate system", () => {
    const bone = new THREE.Bone();
    bone.name = "center";
    bone.userData.mmdBoneName = "センター";

    const clip = createThreeAnimationClip(createAnimation("センター"), [bone]);
    const quaternionTrack = clip.tracks.find((track) => track.name === ".bones[center].quaternion");

    expectTupleCloseTo(Array.from(quaternionTrack?.values ?? []), [-0.1, -0.2, 0.3, 0.4]);
  });
});

describe("createThreePoseAnimationClip", () => {
  it("uses rest local position plus MMD pose translation offsets", () => {
    const bone = new THREE.Bone();
    bone.name = "center";
    bone.position.set(1, 2, -3);
    bone.userData.mmdBoneName = "センター";

    const clip = createThreePoseAnimationClip(createPose("センター"), [bone]);
    const positionTrack = clip.tracks.find((track) => track.name === ".bones[center].position");
    const quaternionTrack = clip.tracks.find((track) => track.name === ".bones[center].quaternion");

    expect(Array.from(positionTrack?.values ?? [])).toEqual([5, 7, -9]);
    expectTupleCloseTo(Array.from(quaternionTrack?.values ?? []), [-0.1, -0.2, 0.3, 0.4]);
  });
});

function createAnimation(boneName: string): MmdAnimation {
  return {
    metadata: {
      modelName: "test",
      counts: {
        bones: 1,
        morphs: 0,
        cameras: 0,
        lights: 0,
        selfShadows: 0,
        properties: 0
      },
      maxFrame: 0,
      diagnostics: []
    },
    boneTracks: {
      [boneName]: [
        {
          frame: 0,
          translation: [4, 5, 6],
          rotation: [0.1, 0.2, 0.3, 0.4],
          interpolation: createInterpolation()
        }
      ]
    },
    morphTracks: {},
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
}

function createPose(boneName: string): MmdPose {
  return {
    metadata: {
      modelFile: "test.pmx",
      declaredBoneCount: 1,
      parsedBoneCount: 1,
      diagnostics: []
    },
    bones: {
      [boneName]: {
        translation: [4, 5, 6],
        rotation: [0.1, 0.2, 0.3, 0.4]
      }
    },
    morphs: {}
  };
}

function createInterpolation() {
  const curve = [0, 0, 127, 127] as [number, number, number, number];
  return {
    translationX: curve,
    translationY: curve,
    translationZ: curve,
    rotation: curve
  };
}

function expectTupleCloseTo(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN);
  });
}
