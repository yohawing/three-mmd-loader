import type { MmdAnimRuntimeWasmModel, MmdAnimRuntimeWasmRuntimeInstance } from "./mmdAnimRuntime.js";

/** Bone indices refer to the PMX model, not Humanoid slots. */
export interface MmdHostRigDefinition {
  readonly drivenBoneIndices: Uint32Array;
  /** Explicit PMX IK controllers. Ordinary FK playback uses an empty list. */
  readonly goalBoneIndices: Uint32Array;
}

/** Fresh pre-morph MMD-local input. Never recapture the previous display output. */
export interface MmdHostRigPose {
  /** Parent-local rest-position offsets, in MMD coordinates and units. */
  readonly positions: Float32Array;
  /** Local XYZW quaternions in MMD coordinates. */
  readonly rotations: Float32Array;
  /** Positive, uniform XYZ scale per bone. */
  readonly scales: Float32Array;
  readonly morphWeights: Float32Array;
  /** One flag per model IK chain; undeclared chains must remain disabled. */
  readonly ikEnabled: Uint8Array;
}

export interface MmdAnimRuntimeWasmHostRig {
  evaluateWithExternalPhysics?(
    instance: MmdAnimRuntimeWasmRuntimeInstance,
    positions: Float32Array,
    rotations: Float32Array,
    scales: Float32Array,
    morphWeights: Float32Array,
    ikEnabled: Uint8Array,
    ikTolerance: number,
    ikMaxIterationsCap: number,
    callback: (before: Float32Array, output: Float32Array, mask: Uint8Array) => boolean
  ): void;
  evaluate(
    instance: MmdAnimRuntimeWasmRuntimeInstance,
    positions: Float32Array,
    rotations: Float32Array,
    scales: Float32Array,
    morphWeights: Float32Array,
    ikEnabled: Uint8Array,
    ikTolerance: number,
    ikMaxIterationsCap: number
  ): void;
  free(): void;
}

export interface MmdAnimRuntimeWasmHostRigConstructor {
  new(model: MmdAnimRuntimeWasmModel, drivenBones: Uint32Array, goalBones: Uint32Array): MmdAnimRuntimeWasmHostRig;
}
