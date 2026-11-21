import type { BinaryReader } from "../binary/index.js";
import type { JointData, RigidBodyData, SkeletonData } from "./modelTypes.js";
import { normalizePmdIndex, readCount, readFixedText } from "./pmdBinary.js";

export function readOptionalRigidBodies(reader: BinaryReader): RigidBodyData[] {
  if (reader.remaining < 4) {
    return [];
  }
  const count = readCount(reader, "rigid body");
  const rigidBodies: RigidBodyData[] = [];
  for (let i = 0; i < count; i++) {
    rigidBodies.push({
      name: readFixedText(reader, 20),
      englishName: "",
      boneIndex: normalizePmdIndex(reader.u16()),
      group: reader.u8(),
      mask: reader.u16(),
      shape: toRigidBodyShape(reader.u8()),
      size: readVec3(reader),
      position: readVec3(reader),
      rotation: readVec3(reader),
      mass: reader.f32(),
      linearDamping: reader.f32(),
      angularDamping: reader.f32(),
      restitution: reader.f32(),
      friction: reader.f32(),
      mode: toRigidBodyMode(reader.u8())
    });
  }
  return rigidBodies;
}

export function normalizePmdRigidBodyPositions(
  rigidBodies: RigidBodyData[],
  skeleton: SkeletonData
): RigidBodyData[] {
  for (const body of rigidBodies) {
    const bone = skeleton.bones[body.boneIndex];
    if (!bone) {
      continue;
    }
    body.position = [
      body.position[0] + bone.position[0],
      body.position[1] + bone.position[1],
      body.position[2] + bone.position[2]
    ];
  }
  return rigidBodies;
}

export function readOptionalJoints(reader: BinaryReader): JointData[] {
  if (reader.remaining < 4) {
    return [];
  }
  const count = readCount(reader, "joint");
  const joints: JointData[] = [];
  for (let i = 0; i < count; i++) {
    joints.push({
      name: readFixedText(reader, 20),
      englishName: "",
      type: "generic6dofSpring",
      rigidBodyIndexA: reader.u32(),
      rigidBodyIndexB: reader.u32(),
      position: readVec3(reader),
      rotation: readVec3(reader),
      translationLowerLimit: readVec3(reader),
      translationUpperLimit: readVec3(reader),
      rotationLowerLimit: readVec3(reader),
      rotationUpperLimit: readVec3(reader),
      springTranslationFactor: readVec3(reader),
      springRotationFactor: readVec3(reader)
    });
  }
  return joints;
}

function readVec3(reader: BinaryReader): [number, number, number] {
  return [reader.f32(), reader.f32(), reader.f32()];
}

function toRigidBodyShape(value: number): RigidBodyData["shape"] {
  switch (value) {
    case 0:
      return "sphere";
    case 1:
      return "box";
    case 2:
      return "capsule";
    default:
      return "unknown";
  }
}

function toRigidBodyMode(value: number): RigidBodyData["mode"] {
  switch (value) {
    case 0:
      return "static";
    case 1:
      return "dynamic";
    case 2:
      return "dynamicBone";
    default:
      return "unknown";
  }
}
