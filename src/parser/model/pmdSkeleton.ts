import type { BinaryReader } from "../binary/index.js";
import type { SkeletonData } from "./modelTypes.js";
import { normalizePmdIndex, readFixedText } from "./pmdBinary.js";

export function readPmdSkeleton(reader: BinaryReader) {
  const boneCount = reader.u16();
  const skeleton: SkeletonData = { bones: [] };
  const pmdBoneTypes: number[] = [];
  for (let i = 0; i < boneCount; i++) {
    const boneName = readFixedText(reader, 20);
    const parentIndex = normalizePmdIndex(reader.u16());
    const tailIndex = normalizePmdIndex(reader.u16());
    const boneType = reader.u8();
    const ikIndex = normalizePmdIndex(reader.u16());
    pmdBoneTypes.push(boneType);
    const flags = createPmdBoneFlags(boneType, tailIndex);
    skeleton.bones.push({
      name: boneName,
      englishName: "",
      parentIndex,
      layer: boneType === 2 ? 1 : 0,
      position: [reader.f32(), reader.f32(), reader.f32()],
      tailIndex: flags.indexedTail ? tailIndex : -1,
      tailPosition: undefined,
      flags,
      appendTransform:
        boneType === 5
          ? {
              parentIndex: tailIndex,
              weight: ikIndex * 0.01
            }
          : undefined
    });
  }
  applyPmdTwistAxes(skeleton, pmdBoneTypes);

  const ikCount = reader.u16();
  const synthesizedIkChainBoneNames: string[] = [];
  for (let i = 0; i < ikCount; i++) {
    const ikBoneIndex = reader.u16();
    const targetBoneIndex = reader.u16();
    const linkCount = reader.u8();
    const loopCount = reader.u16();
    const limitAngle = reader.f32();
    const links = [];
    for (let j = 0; j < linkCount; j++) {
      const boneIndex = reader.u16();
      const boneName = skeleton.bones[boneIndex]?.name ?? "";
      links.push({
        boneIndex,
        limits: isPmdKneeBone(boneName)
          ? {
              kind: "pmdKnee" as const,
              lower: [-Math.PI, 0, 0] as [number, number, number],
              upper: [-0.0001, 0, 0] as [number, number, number]
            }
          : undefined
      });
    }
    const bone = skeleton.bones[ikBoneIndex];
    if (bone) {
      const ik = {
        targetIndex: targetBoneIndex,
        loopCount,
        limitAngle,
        links
      };
      if (bone.ik) {
        const chainBone = createPmdIkChainBone(bone, ikBoneIndex);
        chainBone.ik = ik;
        skeleton.bones.push(chainBone);
        synthesizedIkChainBoneNames.push(chainBone.name);
        continue;
      }
      bone.flags.ik = true;
      bone.flags.translatable = true;
      bone.layer = 1;
      bone.ik = ik;
    }
  }

  return { skeleton, pmdBoneTypes, synthesizedIkChainBoneNames };
}

function createPmdBoneFlags(
  boneType: number,
  tailIndex: number
): SkeletonData["bones"][number]["flags"] {
  const rotateEffect = boneType === 5;
  return {
    indexedTail: !rotateEffect && tailIndex > 0,
    rotatable: true,
    translatable: boneType === 1 || boneType === 2,
    visible: boneType !== 5 && boneType !== 7,
    enabled: true,
    ik: boneType === 2,
    appendLocal: false,
    appendRotate: rotateEffect,
    appendTranslate: false,
    fixedAxis: false,
    localAxis: false,
    transformAfterPhysics: false,
    externalParentTransform: false
  };
}

function applyPmdTwistAxes(skeleton: SkeletonData, boneTypes: readonly number[]): void {
  for (let index = 0; index < skeleton.bones.length; index++) {
    const bone = skeleton.bones[index];
    if (!bone) {
      continue;
    }
    if (boneTypes[index] !== 8) {
      continue;
    }
    const tail = skeleton.bones[bone.tailIndex] ?? skeleton.bones[0];
    if (!tail || tail === bone) {
      continue;
    }
    const axis = normalizeVec3([
      tail.position[0] - bone.position[0],
      tail.position[1] - bone.position[1],
      tail.position[2] - bone.position[2]
    ]);
    bone.fixedAxis = axis;
    bone.flags.fixedAxis = true;
    bone.flags.indexedTail = false;
  }
}

function createPmdIkChainBone(
  source: SkeletonData["bones"][number],
  parentIndex: number
): SkeletonData["bones"][number] {
  return {
    name: `${source.name}+`,
    englishName: source.englishName,
    parentIndex,
    layer: source.layer,
    position: [...source.position],
    tailIndex: -1,
    tailPosition: [0, 0, 0],
    flags: {
      ...source.flags,
      indexedTail: false,
      visible: false
    },
    appendTransform:
      source.appendTransform === undefined ? undefined : { ...source.appendTransform },
    fixedAxis: source.fixedAxis === undefined ? undefined : [...source.fixedAxis],
    localAxis:
      source.localAxis === undefined
        ? undefined
        : {
            x: [...source.localAxis.x],
            z: [...source.localAxis.z]
          },
    externalParentKey: source.externalParentKey,
    ikStateName: source.ikStateName ?? source.name
  };
}

function normalizeVec3(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= 1e-8) {
    return [0, 0, 0];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function isPmdKneeBone(name: string): boolean {
  return name.includes("ひざ") || name.includes("ヒザ") || name.toLowerCase().includes("knee");
}
