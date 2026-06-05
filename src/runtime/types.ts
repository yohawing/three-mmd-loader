/* eslint-disable @typescript-eslint/consistent-type-imports */

export interface MmdFrameState {
  readonly seconds: number;
  readonly frame: number;
  readonly frameRate: number;
}

export interface MmdRuntimeDebugStageState {
  readonly worldMatricesColumnMajor: readonly number[];
  readonly morphWeights: readonly number[];
}

export interface MmdRuntimeDebugState {
  readonly stages: {
    readonly vmdInterpolation: MmdRuntimeDebugStageState;
    readonly appendTransform: MmdRuntimeDebugStageState;
    readonly ik: MmdRuntimeDebugStageState;
    readonly physics: MmdRuntimeDebugStageState;
  };
}

/**
 * Controls animation, IK, and physics evaluation for one MMD model.
 *
 * Typical loader users can call ThreeMmdModel.setAnimation(...) and
 * ThreeMmdModel.update(...). Use this interface directly when you need lower
 * level control over evaluation and render synchronization.
 */
export interface MmdRuntime {
  setAnimation(
    animation: import("../parser/model/modelTypes.js").MmdAnimation,
    mesh: import("three").SkinnedMesh
  ): void;

  /**
   * Evaluates animation state without syncing a render object.
   *
   * The returned state is volatile and may be reused by later evaluate / tick /
   * seek / reset calls to keep per-frame updates allocation-free. Call
   * frameState() when you need to retain a stable snapshot.
   */
  evaluate(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState;

  /**
   * Evaluates animation state and syncs the provided render object.
   *
   * The returned state is volatile; use frameState() for a retained snapshot.
   */
  tick(seconds: number, options?: MmdRuntimeTickOptions): MmdFrameState;

  /**
   * @deprecated Use tick(seconds, { mesh, ...options }) instead.
   */
  tick(
    seconds: number,
    mesh: import("three").Object3D | null | undefined,
    options?: MmdRuntimeEvaluateOptions
  ): MmdFrameState;

  /** Seeks the runtime. The returned state is volatile; use frameState() for a snapshot. */
  seek(seconds: number): MmdFrameState;
  resetPose(): void;
  clearAnimation(): void;

  /**
   * Returns the current VMD camera state when the assigned animation has camera frames.
   *
   * The returned state is volatile and may be reused by later evaluate / tick /
   * seek / reset calls.
   */
  cameraState(): import("../parser/model/modelTypes.js").CameraState | undefined;

  /**
   * Returns the current VMD light state when the assigned animation has light frames.
   *
   * The returned state is volatile and may be reused by later evaluate / tick /
   * seek / reset calls.
   */
  lightState(): import("../parser/model/modelTypes.js").LightState | undefined;

  /**
   * @deprecated Prefer seek / resetPose / clearAnimation for finer control.
   * The returned state is volatile; use frameState() for a retained snapshot.
   */
  reset(seconds?: number): MmdFrameState;

  /** Returns a stable snapshot of the current frame state. */
  frameState(): MmdFrameState;
  debugState(): MmdRuntimeDebugState;
  debugRigidBodyWorldTransformsColumnMajor?(): readonly (readonly number[])[];
}

export interface MmdRuntimeEvaluateOptions {
  readonly physics?: boolean;
  readonly ik?: boolean;
}

export interface MmdRuntimeTickOptions extends MmdRuntimeEvaluateOptions {
  readonly mesh?: import("three").Object3D | null | undefined;
}

export interface DefaultMmdRuntimeOptions {
  /** MMD timeline frame rate. Defaults to 30. */
  readonly frameRate?: number;
  /** Initial runtime time in seconds. Defaults to 0. */
  readonly initialSeconds?: number;
  /** Physics integration mode. Defaults to "none". */
  readonly physics?: "none" | "stateful-spring" | "external";
  /** External physics backend used when physics is "external". */
  readonly physicsBackend?: import("../physics/index.js").MmdPhysicsBackend;
}

export interface RuntimeRestTransform {
  readonly position: import("three").Vector3;
  readonly quaternion: import("three").Quaternion;
}

export interface RuntimePhysicsData {
  readonly bones: readonly RuntimePhysicsBone[];
  readonly rigidBodies: readonly RuntimeRigidBody[];
  readonly joints: readonly RuntimeJoint[];
}

export interface RuntimeExternalPhysicsData {
  readonly bones: readonly RuntimeExternalPhysicsBone[];
  readonly skeleton: NonNullable<import("../physics/index.js").MmdPhysicsStepContext["skeleton"]>;
  readonly rigidBodies: NonNullable<import("../physics/index.js").MmdPhysicsStepContext["rigidBodies"]>;
  readonly joints: NonNullable<import("../physics/index.js").MmdPhysicsStepContext["joints"]>;
  readonly morphImpulses: NonNullable<import("../physics/index.js").MmdPhysicsStepContext["morphImpulses"]>;
}

export interface RuntimePhysicsBone {
  readonly name: string;
  readonly englishName: string;
}

export interface RuntimeExternalPhysicsBone {
  readonly name?: string;
  readonly englishName?: string;
}

export interface RuntimeRigidBody {
  readonly boneIndex: number;
  readonly mode: string;
  readonly size: readonly number[];
  readonly mass: number;
  readonly linearDamping: number;
}

export interface RuntimeJoint {
  readonly rigidBodyIndexA: number;
  readonly rigidBodyIndexB: number;
  readonly translationLowerLimit: readonly number[];
  readonly translationUpperLimit: readonly number[];
  readonly springTranslationFactor: readonly number[];
}

export interface RuntimeExternalRigidBody {
  readonly name?: string;
  readonly englishName?: string;
  readonly boneIndex: number;
  readonly group: number;
  readonly mask: number;
  readonly shape: "sphere" | "box" | "capsule" | "unknown";
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly mass: number;
  readonly linearDamping: number;
  readonly angularDamping: number;
  readonly restitution: number;
  readonly friction: number;
  readonly mode: "static" | "dynamic" | "dynamicBone" | "unknown";
}

export interface RuntimeExternalJoint {
  readonly name?: string;
  readonly englishName?: string;
  readonly rigidBodyIndexA: number;
  readonly rigidBodyIndexB: number;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly translationLowerLimit: readonly [number, number, number];
  readonly translationUpperLimit: readonly [number, number, number];
  readonly rotationLowerLimit: readonly [number, number, number];
  readonly rotationUpperLimit: readonly [number, number, number];
  readonly springTranslationFactor: readonly [number, number, number];
  readonly springRotationFactor: readonly [number, number, number];
}

export interface RuntimeExternalMorphImpulse {
  readonly morphIndex: number;
  readonly rigidBodyIndex: number;
  readonly local: boolean;
  readonly velocity: readonly [number, number, number];
  readonly torque: readonly [number, number, number];
}

export type RuntimeBoneMorphOffset = {
  readonly boneIndex: number;
  readonly translation: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
};

export type RuntimeMorph = Pick<
  import("../parser/model/modelTypes.js").MorphData,
  "type" | "groupOffsets" | "flipOffsets"
> & {
  readonly boneOffsets?: readonly RuntimeBoneMorphOffset[];
  readonly impulseOffsets?: readonly RuntimeExternalMorphImpulse[];
};
