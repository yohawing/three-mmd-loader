import type {
  MmdPhysicsDiagnostic,
  MmdPhysicsSkeleton,
  MmdPhysicsRigidBody,
  MmdPhysicsJointLimit,
  MmdPhysicsJoint,
  MmdPhysicsMorphImpulse
} from "./backend.js";
import {
  pushStepContextDiagnostic,
  validateContextFiniteNumber,
  validateIntegerIndex,
  validateUniqueIndex,
  validateTuple,
  pushInvalidValueDiagnostic,
  validateEnumValue
} from "./validation.js";

export function validateSkeleton(skeleton: MmdPhysicsSkeleton, diagnostics: MmdPhysicsDiagnostic[]): void {
  const seen = new Set<number>();
  for (let i = 0; i < skeleton.bones.length; i += 1) {
    const bone = skeleton.bones[i];
    if (!bone) {
      pushInvalidValueDiagnostic(diagnostics, `skeleton.bones[${i}]`, bone);
      continue;
    }
    validateUniqueIndex(
      bone.index,
      skeleton.bones.length,
      seen,
      diagnostics,
      `skeleton.bones[${i}].index`
    );
    validateIntegerIndex(
      bone.parentIndex,
      skeleton.bones.length,
      diagnostics,
      `skeleton.bones[${i}].parentIndex`,
      true
    );
    if (bone.parentIndex === bone.index) {
      pushStepContextDiagnostic(
        diagnostics,
        "PHYSICS_STEP_CONTEXT_INVALID_REFERENCE",
        `MMD physics step context bone cannot parent itself at skeleton.bones[${i}].parentIndex.`
      );
    }
    validateTuple(bone.restTranslation, 3, diagnostics, `skeleton.bones[${i}].restTranslation`);
    validateTuple(bone.restRotation, 4, diagnostics, `skeleton.bones[${i}].restRotation`);
  }
}

export function validateRigidBodies(
  rigidBodies: readonly MmdPhysicsRigidBody[],
  boneCount: number,
  diagnostics: MmdPhysicsDiagnostic[]
): void {
  const seen = new Set<number>();
  for (let i = 0; i < rigidBodies.length; i += 1) {
    const rigidBody = rigidBodies[i];
    if (!rigidBody) {
      pushInvalidValueDiagnostic(diagnostics, `rigidBodies[${i}]`, rigidBody);
      continue;
    }
    validateUniqueIndex(
      rigidBody.index,
      rigidBodies.length,
      seen,
      diagnostics,
      `rigidBodies[${i}].index`
    );
    validateEnumValue(
      rigidBody.motionType,
      ["static", "dynamic", "dynamicWithBone"],
      diagnostics,
      `rigidBodies[${i}].motionType`
    );
    validateIntegerIndex(
      rigidBody.boneIndex,
      boneCount,
      diagnostics,
      `rigidBodies[${i}].boneIndex`,
      true
    );
    if (!rigidBody.shape) {
      pushInvalidValueDiagnostic(diagnostics, `rigidBodies[${i}].shape`, rigidBody.shape);
    } else {
      validateEnumValue(
        rigidBody.shape.type,
        ["sphere", "box", "capsule"],
        diagnostics,
        `rigidBodies[${i}].shape.type`
      );
      validateTuple(rigidBody.shape.size, 3, diagnostics, `rigidBodies[${i}].shape.size`);
    }
    validateTuple(rigidBody.localTranslation, 3, diagnostics, `rigidBodies[${i}].localTranslation`);
    validateTuple(rigidBody.localRotation, 4, diagnostics, `rigidBodies[${i}].localRotation`);
    validateOptionalFinite(rigidBody.mass, diagnostics, `rigidBodies[${i}].mass`);
    validateOptionalFinite(rigidBody.linearDamping, diagnostics, `rigidBodies[${i}].linearDamping`);
    validateOptionalFinite(
      rigidBody.angularDamping,
      diagnostics,
      `rigidBodies[${i}].angularDamping`
    );
    validateOptionalFinite(rigidBody.restitution, diagnostics, `rigidBodies[${i}].restitution`);
    validateOptionalFinite(rigidBody.friction, diagnostics, `rigidBodies[${i}].friction`);
    validateOptionalFinite(
      rigidBody.collisionGroup,
      diagnostics,
      `rigidBodies[${i}].collisionGroup`
    );
    validateOptionalFinite(rigidBody.collisionMask, diagnostics, `rigidBodies[${i}].collisionMask`);
  }
}

export function validateJoints(
  joints: readonly MmdPhysicsJoint[],
  rigidBodyCount: number,
  diagnostics: MmdPhysicsDiagnostic[]
): void {
  const seen = new Set<number>();
  for (let i = 0; i < joints.length; i += 1) {
    const joint = joints[i];
    if (!joint) {
      pushInvalidValueDiagnostic(diagnostics, `joints[${i}]`, joint);
      continue;
    }
    validateUniqueIndex(joint.index, joints.length, seen, diagnostics, `joints[${i}].index`);
    validateIntegerIndex(
      joint.rigidBodyIndexA,
      rigidBodyCount,
      diagnostics,
      `joints[${i}].rigidBodyIndexA`
    );
    validateIntegerIndex(
      joint.rigidBodyIndexB,
      rigidBodyCount,
      diagnostics,
      `joints[${i}].rigidBodyIndexB`
    );
    validateTuple(joint.translation, 3, diagnostics, `joints[${i}].translation`);
    validateTuple(joint.rotation, 4, diagnostics, `joints[${i}].rotation`);
    validateJointLimit(joint.linearLimit, diagnostics, `joints[${i}].linearLimit`);
    validateJointLimit(joint.angularLimit, diagnostics, `joints[${i}].angularLimit`);
    validateTuple(joint.spring?.linear, 3, diagnostics, `joints[${i}].spring.linear`);
    validateTuple(joint.spring?.angular, 3, diagnostics, `joints[${i}].spring.angular`);
  }
}

function validateJointLimit(
  limit: MmdPhysicsJointLimit | undefined,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  if (!limit) {
    return;
  }
  validateTuple(limit.lower, 3, diagnostics, `${path}.lower`);
  validateTuple(limit.upper, 3, diagnostics, `${path}.upper`);
}

export function validateMorphImpulses(
  morphImpulses: readonly MmdPhysicsMorphImpulse[],
  rigidBodyCount: number,
  diagnostics: MmdPhysicsDiagnostic[]
): void {
  for (let i = 0; i < morphImpulses.length; i += 1) {
    const morphImpulse = morphImpulses[i];
    if (!morphImpulse) {
      pushInvalidValueDiagnostic(diagnostics, `morphImpulses[${i}]`, morphImpulse);
      continue;
    }
    if (!Number.isInteger(morphImpulse.morphIndex) || morphImpulse.morphIndex < 0) {
      pushStepContextDiagnostic(
        diagnostics,
        "PHYSICS_STEP_CONTEXT_INVALID_INDEX",
        `MMD physics step context contains an invalid index at morphImpulses[${i}].morphIndex: ${String(
          morphImpulse.morphIndex
        )}.`
      );
    }
    validateContextFiniteNumber(morphImpulse.weight, diagnostics, `morphImpulses[${i}].weight`);
    validateIntegerIndex(
      morphImpulse.rigidBodyIndex,
      rigidBodyCount,
      diagnostics,
      `morphImpulses[${i}].rigidBodyIndex`
    );
    validateTuple(morphImpulse.force, 3, diagnostics, `morphImpulses[${i}].force`);
    validateTuple(morphImpulse.torque, 3, diagnostics, `morphImpulses[${i}].torque`);
  }
}

function validateOptionalFinite(
  value: number | undefined,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  if (value === undefined) {
    return;
  }
  validateContextFiniteNumber(value, diagnostics, path);
}
