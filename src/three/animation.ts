import * as THREE from "three";

import type { MmdAnimation, MmdPose, VmdBoneFrame, VmdMorphFrame } from "../parser/model/modelTypes.js";

export interface ThreeAnimationClipOptions {
  readonly morphTargetDictionary?: Record<string, number>;
}

export function createThreeAnimationClip(
  animation: MmdAnimation,
  skeletonBones: THREE.Bone[],
  options: ThreeAnimationClipOptions = {}
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const boneByVmdName = createBoneNameMap(skeletonBones);

  for (const [vmdBoneName, frames] of Object.entries(animation.boneTracks)) {
    const bone = boneByVmdName.get(vmdBoneName);
    if (!bone || frames.length === 0) {
      continue;
    }
    tracks.push(createPositionTrack(bone, frames));
    tracks.push(createQuaternionTrack(bone.name, frames));
  }

  const unresolvedMorphTracks: Record<string, VmdMorphFrame[]> = {};
  for (const [morphName, frames] of Object.entries(animation.morphTracks)) {
    const morphIndex = options.morphTargetDictionary?.[morphName];
    if (morphIndex === undefined) {
      unresolvedMorphTracks[morphName] = frames;
      continue;
    }
    tracks.push(createMorphTrack(morphIndex, frames));
  }

  const clip = new THREE.AnimationClip(animationName(animation), -1, tracks);
  (clip as THREE.AnimationClip & { userData: Record<string, unknown> }).userData = {
    mmdAnimation: animation,
    mmdMorphTracks: unresolvedMorphTracks
  };
  return clip;
}

export function createThreePoseAnimationClip(
  pose: MmdPose,
  skeletonBones: THREE.Bone[],
  name = "pose"
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const boneByVmdName = createBoneNameMap(skeletonBones);
  for (const [boneName, bonePose] of Object.entries(pose.bones)) {
    const bone = boneByVmdName.get(boneName);
    if (!bone) {
      continue;
    }
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `.bones[${bone.name}].position`,
        [0],
        addMmdTranslationToThreeRestPosition(bone, bonePose.translation)
      )
    );
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `.bones[${bone.name}].quaternion`,
        [0],
        mmdQuaternionToThree(bonePose.rotation)
      )
    );
  }
  return new THREE.AnimationClip(name, 0, tracks);
}

function createBoneNameMap(skeletonBones: readonly THREE.Bone[]): Map<string, THREE.Bone> {
  const bones = new Map<string, THREE.Bone>();
  for (const bone of skeletonBones) {
    bones.set(bone.name, bone);
  }
  for (const bone of skeletonBones) {
    const mmdBoneName = bone.userData.mmdBoneName;
    if (typeof mmdBoneName === "string" && !bones.has(mmdBoneName)) {
      bones.set(mmdBoneName, bone);
    }
  }
  return bones;
}

function createPositionTrack(bone: THREE.Bone, frames: readonly VmdBoneFrame[]): THREE.VectorKeyframeTrack {
  const times = frames.map((frame) => frame.frame / 30);
  const values = frames.flatMap((frame) => addMmdTranslationToThreeRestPosition(bone, frame.translation));
  return new THREE.VectorKeyframeTrack(`.bones[${bone.name}].position`, times, values);
}

function createQuaternionTrack(
  boneName: string,
  frames: readonly VmdBoneFrame[]
): THREE.QuaternionKeyframeTrack {
  const times = frames.map((frame) => frame.frame / 30);
  const values = frames.flatMap((frame) => mmdQuaternionToThree(frame.rotation));
  return new THREE.QuaternionKeyframeTrack(`.bones[${boneName}].quaternion`, times, values);
}

function createMorphTrack(index: number, frames: readonly VmdMorphFrame[]): THREE.NumberKeyframeTrack {
  const times = frames.map((frame) => frame.frame / 30);
  const values = frames.map((frame) => frame.weight);
  return new THREE.NumberKeyframeTrack(`.morphTargetInfluences[${index}]`, times, values);
}

function animationName(animation: MmdAnimation): string {
  const metadata = animation.metadata as { readonly name?: string; readonly modelName?: string };
  return metadata.name ?? metadata.modelName ?? "motion";
}

function addMmdTranslationToThreeRestPosition(
  bone: THREE.Bone,
  translation: readonly [number, number, number]
): [number, number, number] {
  return [bone.position.x + translation[0], bone.position.y + translation[1], bone.position.z - translation[2]];
}

function mmdQuaternionToThree(
  rotation: readonly [number, number, number, number]
): [number, number, number, number] {
  return [-rotation[0], -rotation[1], rotation[2], rotation[3]];
}
