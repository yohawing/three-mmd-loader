import type {
  MmdPhysicsDiagnostic,
  MmdPhysicsNumericBuffer,
  MmdPhysicsSkeleton,
  MmdPhysicsRigidBody,
  MmdPhysicsJoint,
  MmdPhysicsMorphImpulse,
  MmdPhysicsOutputBuffers
} from "./backend.js";
import {
  validateSkeleton,
  validateRigidBodies,
  validateJoints,
  validateMorphImpulses
} from "./modelValidation.js";
import {
  pushStepContextDiagnostic,
  pushMissingStepContextDiagnostic,
  validateContextFiniteNumber,
  validateIntegerIndex
} from "./validation.js";
import type {
  MmdPhysicsDebugHooks
} from "./debugSnapshot.js";

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
  buffer: ArrayLike<number>,
  maxExclusive: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  for (let i = 0; i < buffer.length; i += 1) {
    validateIntegerIndex(buffer[i], maxExclusive, diagnostics, `${path}[${i}]`);
  }
}
