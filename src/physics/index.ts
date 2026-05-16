export type MmdPhysicsDiagnosticLevel = "warning" | "error";

export interface MmdPhysicsDiagnostic {
  readonly level: MmdPhysicsDiagnosticLevel;
  readonly code: string;
  readonly message: string;
}

export type MmdPhysicsVector3Tuple = readonly [x: number, y: number, z: number];

export type MmdPhysicsQuaternionTuple = readonly [
  x: number,
  y: number,
  z: number,
  w: number
];

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
  readonly force?: MmdPhysicsVector3Tuple;
  readonly torque?: MmdPhysicsVector3Tuple;
}

export interface MmdPhysicsRigidBodyTransform {
  readonly rigidBodyIndex: number;
  readonly translation: MmdPhysicsVector3Tuple;
  readonly rotation: MmdPhysicsQuaternionTuple;
  readonly worldMatrixColumnMajor?: MmdPhysicsMatrix4ColumnMajorTuple;
}

export interface MmdPhysicsContact {
  readonly rigidBodyIndexA: number;
  readonly rigidBodyIndexB: number;
  readonly position?: MmdPhysicsVector3Tuple;
  readonly normal?: MmdPhysicsVector3Tuple;
  readonly distance?: number;
  readonly impulse?: number;
}

export interface MmdPhysicsDebugSnapshot {
  readonly rigidBodyTransforms?: readonly MmdPhysicsRigidBodyTransform[];
  readonly contacts?: readonly MmdPhysicsContact[];
}

export type MmdPhysicsDebugSnapshotNonFiniteMode = "throw" | "diagnostic";

export interface MmdPhysicsDebugSnapshotNormalizationOptions {
  readonly nonFinite?: MmdPhysicsDebugSnapshotNonFiniteMode;
}

export interface MmdPhysicsDebugSnapshotNormalizationResult {
  readonly snapshot: MmdPhysicsDebugSnapshot;
  readonly diagnostics: readonly MmdPhysicsDiagnostic[];
}

export interface MmdPhysicsDebugHooks {
  readonly captureRigidBodyTransforms?: boolean;
  readonly captureContacts?: boolean;
  onRigidBodyTransform?(transform: MmdPhysicsRigidBodyTransform): void;
  onContact?(contact: MmdPhysicsContact): void;
  onStepDebug?(snapshot: MmdPhysicsDebugSnapshot): void;
}

export interface MmdPhysicsOutputBuffers {
  readonly translations?: MmdPhysicsMutableNumericBuffer;
  readonly rotations?: MmdPhysicsMutableNumericBuffer;
  readonly worldMatricesColumnMajor?: MmdPhysicsMutableNumericBuffer;
  readonly updatedBoneIndices?: number[];
}

export interface MmdPhysicsStepContext {
  readonly seconds: number;
  readonly deltaSeconds: number;
  readonly frame: number;
  readonly frameRate: number;
  readonly seeking?: boolean;
  readonly skeleton?: MmdPhysicsSkeleton;
  readonly rigidBodies?: readonly MmdPhysicsRigidBody[];
  readonly joints?: readonly MmdPhysicsJoint[];
  readonly inputTranslations?: MmdPhysicsNumericBuffer;
  readonly inputRotations?: MmdPhysicsNumericBuffer;
  readonly inputWorldMatricesColumnMajor?: MmdPhysicsNumericBuffer;
  readonly output?: MmdPhysicsOutputBuffers;
  readonly bonePhysicsToggles?: readonly boolean[] | Uint8Array;
  readonly morphImpulses?: readonly MmdPhysicsMorphImpulse[];
  readonly debug?: MmdPhysicsDebugHooks;
}

export interface MmdPhysicsStepContextSummary {
  readonly boneCount: number;
  readonly rigidBodyCount: number;
  readonly jointCount: number;
  readonly morphImpulseCount: number;
  readonly hasInputTranslations: boolean;
  readonly hasInputRotations: boolean;
  readonly hasInputWorldMatricesColumnMajor: boolean;
  readonly hasOutputTranslations: boolean;
  readonly hasOutputRotations: boolean;
  readonly hasOutputWorldMatricesColumnMajor: boolean;
  readonly hasBonePhysicsToggles: boolean;
}

export interface MmdPhysicsStepContextValidationResult {
  readonly valid: boolean;
  readonly summary: MmdPhysicsStepContextSummary;
  readonly diagnostics: readonly MmdPhysicsDiagnostic[];
}

export interface MmdPhysicsStepContextValidationOptions {
  readonly requireConcreteBackendFields?: boolean;
}

export interface MmdPhysicsResetContext {
  readonly seconds: number;
  readonly frame: number;
  readonly frameRate: number;
}

export interface MmdPhysicsStepResult {
  readonly simulated: boolean;
  readonly diagnostics?: readonly MmdPhysicsDiagnostic[];
  readonly debug?: MmdPhysicsDebugSnapshot;
}

export interface MmdPhysicsBackend {
  readonly name: string;
  readonly disabled: boolean;
  readonly disposed: boolean;
  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult;
  reset?(context?: MmdPhysicsResetContext): void;
  dispose?(): void;
  diagnostics?(): readonly MmdPhysicsDiagnostic[];
}

export interface DisabledMmdPhysicsBackendOptions {
  readonly name?: string;
  readonly reason?: string;
}

export class DisabledMmdPhysicsBackend implements MmdPhysicsBackend {
  readonly disabled = true;
  readonly name: string;
  private readonly diagnostic: MmdPhysicsDiagnostic | undefined;
  private disposedState = false;

  constructor(options: DisabledMmdPhysicsBackendOptions = {}) {
    this.name = options.name ?? "disabled";
    this.diagnostic = options.reason
      ? {
          level: "warning",
          code: "PHYSICS_BACKEND_DISABLED",
          message: options.reason
        }
      : undefined;
  }

  get disposed(): boolean {
    return this.disposedState;
  }

  step(_context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    const diagnostics = this.diagnostics();
    return diagnostics.length > 0
      ? { simulated: false, diagnostics }
      : { simulated: false };
  }

  reset(_context?: MmdPhysicsResetContext): void {
    // Disabled physics owns no simulation state.
  }

  dispose(): void {
    this.disposedState = true;
  }

  diagnostics(): readonly MmdPhysicsDiagnostic[] {
    const diagnostics: MmdPhysicsDiagnostic[] = [];
    if (this.diagnostic) {
      diagnostics.push(this.diagnostic);
    }
    if (this.disposedState) {
      diagnostics.push({
        level: "warning",
        code: "PHYSICS_BACKEND_DISPOSED",
        message: "Physics backend has been disposed."
      });
    }
    return diagnostics;
  }
}

export function createDisabledMmdPhysicsBackend(
  options: DisabledMmdPhysicsBackendOptions = {}
): MmdPhysicsBackend {
  return new DisabledMmdPhysicsBackend(options);
}

export function summarizeMmdPhysicsStepContext(
  context: MmdPhysicsStepContext
): MmdPhysicsStepContextSummary {
  return {
    boneCount: context.skeleton?.bones.length ?? 0,
    rigidBodyCount: context.rigidBodies?.length ?? 0,
    jointCount: context.joints?.length ?? 0,
    morphImpulseCount: context.morphImpulses?.length ?? 0,
    hasInputTranslations: context.inputTranslations !== undefined,
    hasInputRotations: context.inputRotations !== undefined,
    hasInputWorldMatricesColumnMajor: context.inputWorldMatricesColumnMajor !== undefined,
    hasOutputTranslations: context.output?.translations !== undefined,
    hasOutputRotations: context.output?.rotations !== undefined,
    hasOutputWorldMatricesColumnMajor: context.output?.worldMatricesColumnMajor !== undefined,
    hasBonePhysicsToggles: context.bonePhysicsToggles !== undefined
  };
}

export function validateMmdPhysicsStepContext(
  context: MmdPhysicsStepContext,
  options: MmdPhysicsStepContextValidationOptions = {}
): MmdPhysicsStepContextValidationResult {
  const diagnostics: MmdPhysicsDiagnostic[] = [];
  const summary = summarizeMmdPhysicsStepContext(context);
  const boneCount = context.skeleton?.bones.length ?? 0;
  const rigidBodyCount = context.rigidBodies?.length ?? 0;
  const requireConcreteBackendFields = options.requireConcreteBackendFields ?? false;

  validateContextFiniteNumber(context.seconds, diagnostics, "seconds");
  validateContextFiniteNumber(context.deltaSeconds, diagnostics, "deltaSeconds");
  validateContextFiniteNumber(context.frame, diagnostics, "frame");
  validateContextFiniteNumber(context.frameRate, diagnostics, "frameRate");
  if (Number.isFinite(context.frameRate) && context.frameRate <= 0) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_INVALID_VALUE",
      "MMD physics step context frameRate must be positive."
    );
  }
  if (Number.isFinite(context.deltaSeconds) && context.deltaSeconds < 0) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_INVALID_VALUE",
      "MMD physics step context deltaSeconds must be non-negative."
    );
  }

  if (!context.skeleton && requireConcreteBackendFields) {
    pushMissingStepContextDiagnostic(diagnostics, "skeleton");
  } else if (context.skeleton) {
    validateSkeleton(context.skeleton, diagnostics);
  }
  if (!context.rigidBodies && requireConcreteBackendFields) {
    pushMissingStepContextDiagnostic(diagnostics, "rigidBodies");
  } else if (context.rigidBodies) {
    validateRigidBodies(context.rigidBodies, boneCount, diagnostics);
  }
  if (!context.joints && requireConcreteBackendFields) {
    pushMissingStepContextDiagnostic(diagnostics, "joints");
  } else if (context.joints) {
    validateJoints(context.joints, rigidBodyCount, diagnostics);
  }

  validateStepContextBuffer(
    context.inputTranslations,
    boneCount * 3,
    diagnostics,
    "inputTranslations",
    requireConcreteBackendFields
  );
  validateStepContextBuffer(
    context.inputRotations,
    boneCount * 4,
    diagnostics,
    "inputRotations",
    requireConcreteBackendFields
  );
  validateStepContextBuffer(
    context.inputWorldMatricesColumnMajor,
    boneCount * 16,
    diagnostics,
    "inputWorldMatricesColumnMajor",
    requireConcreteBackendFields
  );
  validateStepContextBuffer(
    context.output?.translations,
    boneCount * 3,
    diagnostics,
    "output.translations",
    requireConcreteBackendFields
  );
  validateStepContextBuffer(
    context.output?.rotations,
    boneCount * 4,
    diagnostics,
    "output.rotations",
    requireConcreteBackendFields
  );
  validateStepContextBuffer(
    context.output?.worldMatricesColumnMajor,
    boneCount * 16,
    diagnostics,
    "output.worldMatricesColumnMajor",
    requireConcreteBackendFields
  );

  if (context.bonePhysicsToggles) {
    validateToggleBuffer(context.bonePhysicsToggles, boneCount, diagnostics, "bonePhysicsToggles");
  }
  if (context.output?.updatedBoneIndices) {
    validateIndexBuffer(
      context.output.updatedBoneIndices,
      boneCount,
      diagnostics,
      "output.updatedBoneIndices"
    );
  }
  if (context.morphImpulses) {
    validateMorphImpulses(context.morphImpulses, rigidBodyCount, diagnostics);
  }

  return {
    valid: diagnostics.length === 0,
    summary,
    diagnostics
  };
}

export function validateConcreteMmdPhysicsStepContext(
  context: MmdPhysicsStepContext
): MmdPhysicsStepContextValidationResult {
  return validateMmdPhysicsStepContext(context, { requireConcreteBackendFields: true });
}

function pushStepContextDiagnostic(
  diagnostics: MmdPhysicsDiagnostic[],
  code: string,
  message: string
): void {
  diagnostics.push({
    level: "error",
    code,
    message
  });
}

function pushMissingStepContextDiagnostic(
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  pushStepContextDiagnostic(
    diagnostics,
    "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
    `MMD physics step context is missing required ${path}.`
  );
}

function validateContextFiniteNumber(
  value: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  if (Number.isFinite(value)) {
    return;
  }
  pushStepContextDiagnostic(
    diagnostics,
    "PHYSICS_STEP_CONTEXT_NON_FINITE",
    `MMD physics step context contains a non-finite number at ${path}.`
  );
}

function validateIntegerIndex(
  value: number | undefined,
  maxExclusive: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  allowMinusOne = false
): void {
  if (value === undefined || (allowMinusOne && value === -1)) {
    return;
  }
  if (Number.isInteger(value) && value >= 0 && value < maxExclusive) {
    return;
  }
  pushStepContextDiagnostic(
    diagnostics,
    "PHYSICS_STEP_CONTEXT_INVALID_REFERENCE",
    `MMD physics step context contains an invalid reference at ${path}: ${String(value)}.`
  );
}

function validateUniqueIndex(
  value: number,
  maxExclusive: number,
  seen: Set<number>,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_INVALID_INDEX",
      `MMD physics step context contains an invalid index at ${path}: ${String(value)}.`
    );
    return;
  }
  if (seen.has(value)) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_DUPLICATE_INDEX",
      `MMD physics step context contains a duplicate index at ${path}: ${value}.`
    );
    return;
  }
  seen.add(value);
}

function validateTuple(
  values: readonly number[] | undefined,
  expectedLength: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  if (!values) {
    return;
  }
  if (values.length !== expectedLength) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_INVALID_LENGTH",
      `MMD physics step context ${path} must have length ${expectedLength}; got ${values.length}.`
    );
    return;
  }
  for (let i = 0; i < values.length; i += 1) {
    validateContextFiniteNumber(values[i] ?? Number.NaN, diagnostics, `${path}[${i}]`);
  }
}

function validateStepContextBuffer(
  buffer: MmdPhysicsNumericBuffer | Uint8Array | undefined,
  minLength: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  required: boolean
): void {
  if (!buffer) {
    if (required) {
      pushMissingStepContextDiagnostic(diagnostics, path);
    }
    return;
  }
  if (buffer.length < minLength) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_BUFFER_TOO_SHORT",
      `MMD physics step context ${path} must have at least ${minLength} values; got ${buffer.length}.`
    );
    return;
  }
  for (let i = 0; i < buffer.length; i += 1) {
    validateContextFiniteNumber(buffer[i] ?? Number.NaN, diagnostics, `${path}[${i}]`);
  }
}

function pushInvalidValueDiagnostic(
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  value: unknown
): void {
  pushStepContextDiagnostic(
    diagnostics,
    "PHYSICS_STEP_CONTEXT_INVALID_VALUE",
    `MMD physics step context contains an invalid value at ${path}: ${String(value)}.`
  );
}

function validateEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): value is T {
  if (allowed.includes(value as T)) {
    return true;
  }
  pushInvalidValueDiagnostic(diagnostics, path, value);
  return false;
}

function validateToggleBuffer(
  buffer: readonly boolean[] | Uint8Array,
  minLength: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  if (buffer.length < minLength) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_BUFFER_TOO_SHORT",
      `MMD physics step context ${path} must have at least ${minLength} values; got ${buffer.length}.`
    );
  }
}

function validateIndexBuffer(
  buffer: readonly number[],
  maxExclusive: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  for (let i = 0; i < buffer.length; i += 1) {
    validateIntegerIndex(buffer[i], maxExclusive, diagnostics, `${path}[${i}]`);
  }
}

function validateSkeleton(
  skeleton: MmdPhysicsSkeleton,
  diagnostics: MmdPhysicsDiagnostic[]
): void {
  const seen = new Set<number>();
  for (let i = 0; i < skeleton.bones.length; i += 1) {
    const bone = skeleton.bones[i];
    if (!bone) {
      pushInvalidValueDiagnostic(diagnostics, `skeleton.bones[${i}]`, bone);
      continue;
    }
    validateUniqueIndex(bone.index, skeleton.bones.length, seen, diagnostics, `skeleton.bones[${i}].index`);
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

function validateRigidBodies(
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
    validateUniqueIndex(rigidBody.index, rigidBodies.length, seen, diagnostics, `rigidBodies[${i}].index`);
    validateEnumValue(
      rigidBody.motionType,
      ["static", "dynamic", "dynamicWithBone"],
      diagnostics,
      `rigidBodies[${i}].motionType`
    );
    validateIntegerIndex(rigidBody.boneIndex, boneCount, diagnostics, `rigidBodies[${i}].boneIndex`, true);
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
    validateOptionalFinite(rigidBody.angularDamping, diagnostics, `rigidBodies[${i}].angularDamping`);
    validateOptionalFinite(rigidBody.restitution, diagnostics, `rigidBodies[${i}].restitution`);
    validateOptionalFinite(rigidBody.friction, diagnostics, `rigidBodies[${i}].friction`);
    validateOptionalFinite(rigidBody.collisionGroup, diagnostics, `rigidBodies[${i}].collisionGroup`);
    validateOptionalFinite(rigidBody.collisionMask, diagnostics, `rigidBodies[${i}].collisionMask`);
  }
}

function validateJoints(
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
    validateIntegerIndex(joint.rigidBodyIndexA, rigidBodyCount, diagnostics, `joints[${i}].rigidBodyIndexA`);
    validateIntegerIndex(joint.rigidBodyIndexB, rigidBodyCount, diagnostics, `joints[${i}].rigidBodyIndexB`);
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

function validateMorphImpulses(
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

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOptionalTuple(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined
): number {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return -1;
  }
  if (!right) {
    return 1;
  }
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const result = compareNumbers(left[i] ?? 0, right[i] ?? 0);
    if (result !== 0) {
      return result;
    }
  }
  return compareNumbers(left.length, right.length);
}

function cloneVector3Tuple(
  tuple: MmdPhysicsVector3Tuple,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsVector3Tuple | undefined {
  const cloned: MmdPhysicsVector3Tuple = [tuple[0], tuple[1], tuple[2]];
  return pushNonFiniteDiagnostics(cloned, diagnostics, path, nonFinite) ? undefined : cloned;
}

function cloneQuaternionTuple(
  tuple: MmdPhysicsQuaternionTuple,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsQuaternionTuple | undefined {
  const cloned: MmdPhysicsQuaternionTuple = [tuple[0], tuple[1], tuple[2], tuple[3]];
  return pushNonFiniteDiagnostics(cloned, diagnostics, path, nonFinite) ? undefined : cloned;
}

function cloneMatrix4ColumnMajorTuple(
  tuple: MmdPhysicsMatrix4ColumnMajorTuple,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsMatrix4ColumnMajorTuple | undefined {
  const cloned: MmdPhysicsMatrix4ColumnMajorTuple = [
    tuple[0],
    tuple[1],
    tuple[2],
    tuple[3],
    tuple[4],
    tuple[5],
    tuple[6],
    tuple[7],
    tuple[8],
    tuple[9],
    tuple[10],
    tuple[11],
    tuple[12],
    tuple[13],
    tuple[14],
    tuple[15]
  ];
  return pushNonFiniteDiagnostics(cloned, diagnostics, path, nonFinite) ? undefined : cloned;
}

function pushNonFiniteDiagnostics(
  values: readonly number[],
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): boolean {
  let hasNonFinite = false;
  for (let i = 0; i < values.length; i += 1) {
    if (Number.isFinite(values[i])) {
      continue;
    }

    hasNonFinite = true;
    const diagnostic: MmdPhysicsDiagnostic = {
      level: "error",
      code: "PHYSICS_DEBUG_SNAPSHOT_NON_FINITE",
      message: `Physics debug snapshot contains a non-finite number at ${path}[${i}].`
    };
    if (nonFinite === "throw") {
      throw new TypeError(diagnostic.message);
    }
    diagnostics.push(diagnostic);
  }
  return hasNonFinite;
}

function validateFiniteNumber(
  value: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): boolean {
  if (Number.isFinite(value)) {
    return true;
  }

  const diagnostic: MmdPhysicsDiagnostic = {
    level: "error",
    code: "PHYSICS_DEBUG_SNAPSHOT_NON_FINITE",
    message: `Physics debug snapshot contains a non-finite number at ${path}.`
  };
  if (nonFinite === "throw") {
    throw new TypeError(diagnostic.message);
  }
  diagnostics.push(diagnostic);
  return false;
}

function cloneRigidBodyTransform(
  transform: MmdPhysicsRigidBodyTransform,
  diagnostics: MmdPhysicsDiagnostic[],
  index: number,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsRigidBodyTransform | undefined {
  if (
    !validateFiniteNumber(
      transform.rigidBodyIndex,
      diagnostics,
      `rigidBodyTransforms[${index}].rigidBodyIndex`,
      nonFinite
    )
  ) {
    return undefined;
  }

  const translation = cloneVector3Tuple(
    transform.translation,
    diagnostics,
    `rigidBodyTransforms[${index}].translation`,
    nonFinite
  );
  const rotation = cloneQuaternionTuple(
    transform.rotation,
    diagnostics,
    `rigidBodyTransforms[${index}].rotation`,
    nonFinite
  );
  const worldMatrixColumnMajor = transform.worldMatrixColumnMajor
    ? cloneMatrix4ColumnMajorTuple(
        transform.worldMatrixColumnMajor,
        diagnostics,
        `rigidBodyTransforms[${index}].worldMatrixColumnMajor`,
        nonFinite
      )
    : undefined;

  if (!translation || !rotation || (transform.worldMatrixColumnMajor && !worldMatrixColumnMajor)) {
    return undefined;
  }

  return worldMatrixColumnMajor
    ? {
        rigidBodyIndex: transform.rigidBodyIndex,
        translation,
        rotation,
        worldMatrixColumnMajor
      }
    : {
        rigidBodyIndex: transform.rigidBodyIndex,
        translation,
        rotation
      };
}

function cloneContact(
  contact: MmdPhysicsContact,
  diagnostics: MmdPhysicsDiagnostic[],
  index: number,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsContact | undefined {
  if (
    !validateFiniteNumber(
      contact.rigidBodyIndexA,
      diagnostics,
      `contacts[${index}].rigidBodyIndexA`,
      nonFinite
    ) ||
    !validateFiniteNumber(
      contact.rigidBodyIndexB,
      diagnostics,
      `contacts[${index}].rigidBodyIndexB`,
      nonFinite
    )
  ) {
    return undefined;
  }

  const position = contact.position
    ? cloneVector3Tuple(contact.position, diagnostics, `contacts[${index}].position`, nonFinite)
    : undefined;
  const normal = contact.normal
    ? cloneVector3Tuple(contact.normal, diagnostics, `contacts[${index}].normal`, nonFinite)
    : undefined;

  if ((contact.position && !position) || (contact.normal && !normal)) {
    return undefined;
  }

  if (
    (contact.distance !== undefined &&
      !validateFiniteNumber(contact.distance, diagnostics, `contacts[${index}].distance`, nonFinite)) ||
    (contact.impulse !== undefined &&
      !validateFiniteNumber(contact.impulse, diagnostics, `contacts[${index}].impulse`, nonFinite))
  ) {
    return undefined;
  }

  return {
    rigidBodyIndexA: contact.rigidBodyIndexA,
    rigidBodyIndexB: contact.rigidBodyIndexB,
    ...(position ? { position } : {}),
    ...(normal ? { normal } : {}),
    ...(contact.distance !== undefined ? { distance: contact.distance } : {}),
    ...(contact.impulse !== undefined ? { impulse: contact.impulse } : {})
  };
}

export function normalizeMmdPhysicsDebugSnapshot(
  snapshot: MmdPhysicsDebugSnapshot,
  options: MmdPhysicsDebugSnapshotNormalizationOptions = {}
): MmdPhysicsDebugSnapshotNormalizationResult {
  const nonFinite = options.nonFinite ?? "throw";
  const diagnostics: MmdPhysicsDiagnostic[] = [];
  const rigidBodyTransforms = (snapshot.rigidBodyTransforms ?? [])
    .map((transform, index) => cloneRigidBodyTransform(transform, diagnostics, index, nonFinite))
    .filter((transform): transform is MmdPhysicsRigidBodyTransform => transform !== undefined)
    .sort((left, right) => compareNumbers(left.rigidBodyIndex, right.rigidBodyIndex));
  const contacts = (snapshot.contacts ?? [])
    .map((contact, index) => cloneContact(contact, diagnostics, index, nonFinite))
    .filter((contact): contact is MmdPhysicsContact => contact !== undefined)
    .sort(
      (left, right) =>
        compareNumbers(left.rigidBodyIndexA, right.rigidBodyIndexA) ||
        compareNumbers(left.rigidBodyIndexB, right.rigidBodyIndexB) ||
        compareOptionalTuple(left.position, right.position) ||
        compareOptionalTuple(left.normal, right.normal) ||
        compareNumbers(left.distance ?? 0, right.distance ?? 0) ||
        compareNumbers(left.impulse ?? 0, right.impulse ?? 0)
    );

  return {
    snapshot: {
      rigidBodyTransforms,
      contacts
    },
    diagnostics
  };
}
