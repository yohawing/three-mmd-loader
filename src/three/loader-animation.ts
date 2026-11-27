import type { MmdAnimation, MmdPose, VmdBoneTrack } from "../parser/model/modelTypes.js";
import type { ModelSource } from "./modelSource.js";

export interface ThreeMmdAnimation {
  readonly source: ModelSource;
  readonly name?: string;
  readonly animation: MmdAnimation;
}

export interface ThreeMmdPose {
  readonly source: ModelSource;
  readonly pose: MmdPose;
}

export function unwrapThreeMmdAnimation(animation: MmdAnimation | ThreeMmdAnimation): MmdAnimation {
  return "animation" in animation ? animation.animation : animation;
}

export function createMmdAnimationFromPose(pose: MmdPose, name: string): MmdAnimation {
  const boneTracks: MmdAnimation["boneTracks"] = {};
  for (const [boneName, bonePose] of Object.entries(pose.bones)) {
    boneTracks[boneName] = {
      packed: "bone",
      frames: new Uint32Array([0]),
      translations: new Float32Array(bonePose.translation),
      rotations: new Float32Array(bonePose.rotation),
      interpolations: new Float32Array(16),
      physicsToggles: new Int8Array([-1])
    } satisfies VmdBoneTrack;
  }
  return {
    kind: "vmd",
    bytes: pose.bytes,
    metadata: {
      modelName: pose.metadata.modelFile,
      counts: {
        bones: Object.keys(boneTracks).length,
        morphs: 0,
        cameras: 0,
        lights: 0,
        selfShadows: 0,
        properties: 0
      },
      maxFrame: 0,
      name
    } as MmdAnimation["metadata"] & { readonly name: string },
    boneTracks,
    morphTracks: {},
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
}
