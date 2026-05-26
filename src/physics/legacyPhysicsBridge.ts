import type {
  MmdPhysicsJoint,
  MmdPhysicsMutableNumericBuffer,
  MmdPhysicsQuaternionTuple,
  MmdPhysicsRigidBody,
  MmdPhysicsRigidBodyMotionType,
  MmdPhysicsRigidBodyShapeType,
  MmdPhysicsVector3Tuple
} from "./index.js";

export interface LegacyMmdPhysicsRigidBodyLike {
  readonly name?: string;
  readonly englishName?: string;
  readonly boneIndex: number;
  readonly group: number;
  readonly mask: number;
  readonly shape: "sphere" | "box" | "capsule" | "unknown";
  readonly size: MmdPhysicsVector3Tuple;
  readonly position: MmdPhysicsVector3Tuple;
  readonly rotation: MmdPhysicsVector3Tuple;
  readonly mass: number;
  readonly linearDamping: number;
  readonly angularDamping: number;
  readonly restitution: number;
  readonly friction: number;
  readonly mode: "static" | "dynamic" | "dynamicBone" | "unknown";
}

export interface LegacyMmdPhysicsJointLike {
  readonly name?: string;
  readonly englishName?: string;
  readonly rigidBodyIndexA: number;
  readonly rigidBodyIndexB: number;
  readonly position: MmdPhysicsVector3Tuple;
  readonly rotation: MmdPhysicsVector3Tuple;
  readonly translationLowerLimit: MmdPhysicsVector3Tuple;
  readonly translationUpperLimit: MmdPhysicsVector3Tuple;
  readonly rotationLowerLimit: MmdPhysicsVector3Tuple;
  readonly rotationUpperLimit: MmdPhysicsVector3Tuple;
  readonly springTranslationFactor: MmdPhysicsVector3Tuple;
  readonly springRotationFactor: MmdPhysicsVector3Tuple;
}

export interface LegacyMmdPhysicsBoneLike {
  readonly name?: string;
  readonly englishName?: string;
}

export function legacyMmdRigidBodyModeToPhysicsMotionType(
  mode: LegacyMmdPhysicsRigidBodyLike["mode"]
): MmdPhysicsRigidBodyMotionType {
  switch (mode) {
    case "static":
      return "static";
    case "dynamicBone":
      return "dynamicWithBone";
    case "dynamic":
    case "unknown":
      return "dynamic";
  }
}

export function legacyMmdRigidBodyShapeToPhysicsShapeType(
  shape: LegacyMmdPhysicsRigidBodyLike["shape"]
): MmdPhysicsRigidBodyShapeType {
  switch (shape) {
    case "box":
      return "box";
    case "capsule":
      return "capsule";
    case "sphere":
    case "unknown":
      return "sphere";
  }
}

export function legacyMmdEulerToQuaternion(
  euler: MmdPhysicsVector3Tuple
): MmdPhysicsQuaternionTuple {
  const halfX = euler[0] * 0.5;
  const halfY = euler[1] * 0.5;
  const halfZ = euler[2] * 0.5;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);

  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz
  ];
}

export function mapLegacyMmdRigidBodyToPhysicsRigidBody(
  rigidBody: LegacyMmdPhysicsRigidBodyLike,
  index: number
): MmdPhysicsRigidBody {
  return {
    index,
    name: rigidBody.name,
    boneIndex: rigidBody.boneIndex,
    motionType: legacyMmdRigidBodyModeToPhysicsMotionType(rigidBody.mode),
    shape: {
      type: legacyMmdRigidBodyShapeToPhysicsShapeType(rigidBody.shape),
      size: rigidBody.size
    },
    localTranslation: rigidBody.position,
    localRotation: legacyMmdEulerToQuaternion(rigidBody.rotation),
    mass: rigidBody.mass,
    linearDamping: rigidBody.linearDamping,
    angularDamping: rigidBody.angularDamping,
    restitution: rigidBody.restitution,
    friction: rigidBody.friction,
    collisionGroup: rigidBody.group,
    collisionMask: rigidBody.mask
  };
}

export function mapLegacyMmdJointToPhysicsJoint(
  joint: LegacyMmdPhysicsJointLike,
  index: number
): MmdPhysicsJoint {
  return {
    index,
    name: joint.name,
    rigidBodyIndexA: joint.rigidBodyIndexA,
    rigidBodyIndexB: joint.rigidBodyIndexB,
    translation: joint.position,
    rotation: legacyMmdEulerToQuaternion(joint.rotation),
    linearLimit: {
      lower: joint.translationLowerLimit,
      upper: joint.translationUpperLimit
    },
    angularLimit: {
      lower: joint.rotationLowerLimit,
      upper: joint.rotationUpperLimit
    },
    spring: {
      linear: joint.springTranslationFactor,
      angular: joint.springRotationFactor
    }
  };
}

export function writeTuple3ArrayToBuffer(
  tuples: readonly MmdPhysicsVector3Tuple[],
  buffer: MmdPhysicsMutableNumericBuffer
): void {
  for (let i = 0; i < tuples.length; i += 1) {
    const tuple = tuples[i];
    const offset = i * 3;
    buffer[offset] = tuple[0];
    buffer[offset + 1] = tuple[1];
    buffer[offset + 2] = tuple[2];
  }
}

export function writeQuaternionArrayToBuffer(
  tuples: readonly MmdPhysicsQuaternionTuple[],
  buffer: MmdPhysicsMutableNumericBuffer
): void {
  for (let i = 0; i < tuples.length; i += 1) {
    const tuple = tuples[i];
    const offset = i * 4;
    buffer[offset] = tuple[0];
    buffer[offset + 1] = tuple[1];
    buffer[offset + 2] = tuple[2];
    buffer[offset + 3] = tuple[3];
  }
}

export function createBonePhysicsToggleBuffer(
  bones: readonly LegacyMmdPhysicsBoneLike[],
  toggles: Readonly<Record<string, number | boolean | undefined>>
): Uint8Array {
  const buffer = new Uint8Array(bones.length);
  for (let i = 0; i < bones.length; i += 1) {
    const bone = bones[i];
    const value =
      (bone.name === undefined ? undefined : toggles[bone.name]) ??
      (bone.englishName === undefined ? undefined : toggles[bone.englishName]) ??
      true;
    buffer[i] = value ? 1 : 0;
  }
  return buffer;
}
