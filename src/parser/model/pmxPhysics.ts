import type { BinaryReader } from "../binary/index.js";
import type { Diagnostic, JointData, RigidBodyData, SoftBodyData } from "./modelTypes.js";
import type { PmxIndexSizes } from "./pmxBinary.js";
import { readCount, readVertexIndex, readVec3 } from "./pmxBinary.js";

export function readRigidBody(
  reader: BinaryReader,
  readText: () => string,
  sizes: PmxIndexSizes
): RigidBodyData {
  return {
    name: readText(),
    englishName: readText(),
    boneIndex: reader.index(sizes.bone),
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
  };
}

export function readJoint(reader: BinaryReader, readText: () => string, sizes: PmxIndexSizes): JointData {
  return {
    name: readText(),
    englishName: readText(),
    type: toJointType(reader.u8()),
    rigidBodyIndexA: reader.index(sizes.rigidBody),
    rigidBodyIndexB: reader.index(sizes.rigidBody),
    position: readVec3(reader),
    rotation: readVec3(reader),
    translationLowerLimit: readVec3(reader),
    translationUpperLimit: readVec3(reader),
    rotationLowerLimit: readVec3(reader),
    rotationUpperLimit: readVec3(reader),
    springTranslationFactor: readVec3(reader),
    springRotationFactor: readVec3(reader)
  };
}

export function readSoftBodies(
  reader: BinaryReader,
  readText: () => string,
  sizes: PmxIndexSizes
): SoftBodyData[] {
  const count = readCount(reader, "soft body");
  const softBodies: SoftBodyData[] = [];
  for (let i = 0; i < count; i++) {
    softBodies.push({
      name: readText(),
      englishName: readText(),
      type: toSoftBodyType(reader.u8()),
      materialIndex: reader.index(sizes.material),
      collisionGroup: reader.u8(),
      collisionMask: reader.u16(),
      flags: reader.u8(),
      bendingConstraintsDistance: reader.i32(),
      clusterCount: reader.i32(),
      totalMass: reader.f32(),
      collisionMargin: reader.f32(),
      aeroModel: toSoftBodyAeroModel(reader.i32()),
      config: {
        velocityCorrectionFactor: reader.f32(),
        dampingCoefficient: reader.f32(),
        dragCoefficient: reader.f32(),
        liftCoefficient: reader.f32(),
        pressureCoefficient: reader.f32(),
        volumeConversationCoefficient: reader.f32(),
        dynamicFrictionCoefficient: reader.f32(),
        poseMatchingCoefficient: reader.f32(),
        rigidContactHardness: reader.f32(),
        kineticContactHardness: reader.f32(),
        softContactHardness: reader.f32(),
        anchorHardness: reader.f32()
      },
      cluster: {
        softVsRigidHardness: reader.f32(),
        softVsKineticHardness: reader.f32(),
        softVsSoftHardness: reader.f32(),
        softVsRigidImpulseSplit: reader.f32(),
        softVsKineticImpulseSplit: reader.f32(),
        softVsSoftImpulseSplit: reader.f32()
      },
      iteration: {
        velocity: reader.i32(),
        position: reader.i32(),
        drift: reader.i32(),
        cluster: reader.i32()
      },
      material: {
        linearStiffnessCoefficient: reader.f32(),
        angularStiffnessCoefficient: reader.f32(),
        volumeStiffnessCoefficient: reader.f32()
      },
      anchors: readSoftBodyAnchors(reader, sizes),
      pinnedVertexIndices: readSoftBodyPinnedVertexIndices(reader, sizes)
    });
  }
  return softBodies;
}

function readSoftBodyAnchors(reader: BinaryReader, sizes: PmxIndexSizes): SoftBodyData["anchors"] {
  const count = readCount(reader, "soft body anchor");
  const anchors: SoftBodyData["anchors"] = [];
  for (let i = 0; i < count; i++) {
    anchors.push({
      rigidBodyIndex: reader.index(sizes.rigidBody),
      vertexIndex: readVertexIndex(reader, sizes.vertex),
      nearMode: reader.u8() !== 0
    });
  }
  return anchors;
}

function readSoftBodyPinnedVertexIndices(reader: BinaryReader, sizes: PmxIndexSizes): number[] {
  const count = readCount(reader, "soft body pinned vertex");
  const vertexIndices: number[] = [];
  for (let i = 0; i < count; i++) {
    vertexIndices.push(readVertexIndex(reader, sizes.vertex));
  }
  return vertexIndices;
}

function toSoftBodyType(value: number): SoftBodyData["type"] {
  switch (value) {
    case 0:
      return "triMesh";
    case 1:
      return "rope";
    default:
      return "unknown";
  }
}

function toSoftBodyAeroModel(value: number): SoftBodyData["aeroModel"] {
  switch (value) {
    case 0:
      return "vertexPoint";
    case 1:
      return "vertexTwoSided";
    case 2:
      return "vertexOneSided";
    case 3:
      return "faceTwoSided";
    case 4:
      return "faceOneSided";
    default:
      return "unknown";
  }
}

export function createSoftBodyDiagnostics(
  softBodies: readonly SoftBodyData[],
  materialCount: number,
  vertexCount: number,
  rigidBodyCount: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (
    softBodies.some((softBody) => softBody.type === "unknown" || softBody.aeroModel === "unknown")
  ) {
    diagnostics.push({
      level: "warning",
      code: "PMX_SOFT_BODY_TYPE_UNSUPPORTED",
      message:
        "Unknown PMX soft-body type or aero model values were parsed but cannot be simulated by the current runtime."
    });
  }
  for (const [softBodyIndex, softBody] of softBodies.entries()) {
    pushSoftBodyReferenceDiagnostic(
      diagnostics,
      softBody.materialIndex,
      materialCount,
      `soft body ${softBodyIndex} material`,
      "material"
    );
    for (const [anchorIndex, anchor] of softBody.anchors.entries()) {
      pushSoftBodyReferenceDiagnostic(
        diagnostics,
        anchor.rigidBodyIndex,
        rigidBodyCount,
        `soft body ${softBodyIndex} anchor ${anchorIndex} rigid body`,
        "rigid body"
      );
      pushSoftBodyReferenceDiagnostic(
        diagnostics,
        anchor.vertexIndex,
        vertexCount,
        `soft body ${softBodyIndex} anchor ${anchorIndex} vertex`,
        "vertex"
      );
    }
    for (const [pinnedIndex, pinnedVertexIndex] of softBody.pinnedVertexIndices.entries()) {
      pushSoftBodyReferenceDiagnostic(
        diagnostics,
        pinnedVertexIndex,
        vertexCount,
        `soft body ${softBodyIndex} pinned vertex ${pinnedIndex}`,
        "vertex"
      );
    }
  }
  return diagnostics;
}

function pushSoftBodyReferenceDiagnostic(
  diagnostics: Diagnostic[],
  index: number,
  count: number,
  owner: string,
  label: string
): void {
  if (index < 0) {
    return;
  }
  if (index >= count) {
    diagnostics.push({
      level: "warning",
      code: "PMX_SOFT_BODY_REFERENCE_INVALID",
      message: `${owner} references ${label} index ${index}, but only ${count} ${label} entries exist.`
    });
  }
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

function toJointType(value: number): JointData["type"] {
  switch (value) {
    case 0:
      return "generic6dofSpring";
    case 1:
      return "generic6dof";
    case 2:
      return "point2point";
    case 3:
      return "coneTwist";
    case 4:
      return "slider";
    case 5:
      return "hinge";
    default:
      return "unknown";
  }
}
