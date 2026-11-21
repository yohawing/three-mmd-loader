import type {
  MmdPhysicsStepContext
} from "./stepContext.js";
import type {
  MmdPhysicsDebugSnapshot
} from "./debugSnapshot.js";

export type MmdPhysicsDiagnosticLevel = "warning" | "error";

export interface MmdPhysicsDiagnostic {
  readonly level: MmdPhysicsDiagnosticLevel;
  readonly code: string;
  readonly message: string;
}

export type MmdPhysicsVector3Tuple = readonly [x: number, y: number, z: number];

export type MmdPhysicsQuaternionTuple = readonly [x: number, y: number, z: number, w: number];

export type MmdPhysicsEulerTuple = readonly [x: number, y: number, z: number];

// Matches Three.js Matrix4.elements storage order: n11, n21, n31, n41, n12, ...
export type MmdPhysicsMatrix4ColumnMajorTuple = readonly [
  n11: number,
  n21: number,
  n31: number,
  n41: number,
  n12: number,
  n22: number,
  n32: number,
  n42: number,
  n13: number,
  n23: number,
  n33: number,
  n43: number,
  n14: number,
  n24: number,
  n34: number,
  n44: number
];

export type MmdPhysicsNumericBuffer = readonly number[] | Float32Array | Float64Array;
export type MmdPhysicsMutableNumericBuffer = number[] | Float32Array | Float64Array;

export interface MmdPhysicsSkeletonBone {
  readonly index: number;
  readonly name?: string;
  readonly parentIndex?: number;
  readonly restTranslation?: MmdPhysicsVector3Tuple;
  readonly restRotation?: MmdPhysicsQuaternionTuple;
  readonly transformAfterPhysics?: boolean;
}

export interface MmdPhysicsSkeleton {
  readonly bones: readonly MmdPhysicsSkeletonBone[];
}

export type MmdPhysicsRigidBodyShapeType = "sphere" | "box" | "capsule";

export type MmdPhysicsRigidBodyMotionType = "static" | "dynamic" | "dynamicWithBone";

export interface MmdPhysicsRigidBodyShape {
  readonly type: MmdPhysicsRigidBodyShapeType;
  readonly size: MmdPhysicsVector3Tuple;
}

export interface MmdPhysicsRigidBody {
  readonly index: number;
  readonly name?: string;
  readonly boneIndex?: number;
  readonly motionType: MmdPhysicsRigidBodyMotionType;
  readonly shape: MmdPhysicsRigidBodyShape;
  readonly localTranslation?: MmdPhysicsVector3Tuple;
  readonly localRotation?: MmdPhysicsQuaternionTuple;
  readonly mass?: number;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly restitution?: number;
  readonly friction?: number;
  readonly collisionGroup?: number;
  readonly collisionMask?: number;
}

export interface MmdPhysicsJointLimit {
  readonly lower: MmdPhysicsVector3Tuple;
  readonly upper: MmdPhysicsVector3Tuple;
}

export interface MmdPhysicsJointSpring {
  readonly linear?: MmdPhysicsVector3Tuple;
  readonly angular?: MmdPhysicsVector3Tuple;
}

export interface MmdPhysicsJoint {
  readonly index: number;
  readonly name?: string;
  readonly rigidBodyIndexA: number;
  readonly rigidBodyIndexB: number;
  readonly translation?: MmdPhysicsVector3Tuple;
  readonly rotation?: MmdPhysicsQuaternionTuple;
  readonly linearLimit?: MmdPhysicsJointLimit;
  readonly angularLimit?: MmdPhysicsJointLimit;
  readonly spring?: MmdPhysicsJointSpring;
}

export interface MmdPhysicsMorphImpulse {
  readonly morphIndex: number;
  readonly weight: number;
  readonly rigidBodyIndex?: number;
  readonly local?: boolean;
  readonly force?: MmdPhysicsVector3Tuple;
  readonly torque?: MmdPhysicsVector3Tuple;
}

export interface MmdPhysicsOutputBuffers {
  readonly translations?: MmdPhysicsMutableNumericBuffer;
  readonly rotations?: MmdPhysicsMutableNumericBuffer;
  readonly worldMatricesColumnMajor?: MmdPhysicsMutableNumericBuffer;
  readonly updatedBoneIndices?: MmdPhysicsMutableIndexBuffer;
}

export type MmdPhysicsMutableIndexBuffer = number[] | Uint32Array<ArrayBuffer>;

export interface MmdPhysicsResetContext {
  readonly seconds: number;
  readonly frame: number;
  readonly frameRate: number;
}

export interface MmdPhysicsStepResult {
  readonly simulated: boolean;
  readonly updatedBoneCount?: number;
  readonly diagnostics?: readonly MmdPhysicsDiagnostic[];
  readonly debug?: MmdPhysicsDebugSnapshot;
}

export interface MmdPhysicsStepBufferLayout {
  readonly boneCount: number;
  readonly translationValueCount: number;
  readonly rotationValueCount: number;
  readonly worldMatrixValueCount: number;
}

export interface MmdPhysicsStepBuffers {
  readonly inputTranslations: Float32Array<ArrayBuffer>;
  readonly inputRotations: Float32Array<ArrayBuffer>;
  readonly inputWorldMatricesColumnMajor: Float32Array<ArrayBuffer>;
  readonly outputTranslations: Float32Array<ArrayBuffer>;
  readonly outputRotations: Float32Array<ArrayBuffer>;
  readonly outputWorldMatricesColumnMajor: Float32Array<ArrayBuffer>;
  readonly bonePhysicsToggles: Uint8Array<ArrayBuffer>;
  readonly updatedBoneIndices?: MmdPhysicsMutableIndexBuffer;
}

export interface MmdPhysicsBackend {
  readonly name: string;
  readonly disabled: boolean;
  readonly disposed: boolean;
  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult;
  reset?(context?: MmdPhysicsResetContext): void;
  dispose?(): void;
  diagnostics?(): readonly MmdPhysicsDiagnostic[];
  debugRigidBodyWorldTransformsColumnMajor?(): readonly MmdPhysicsMatrix4ColumnMajorTuple[];
}

export interface MmdDirectBufferPhysicsBackend extends MmdPhysicsBackend {
  acquireStepBuffers(layout: MmdPhysicsStepBufferLayout): MmdPhysicsStepBuffers | undefined;
}
