import * as THREE from "three";
import { applyMorphOverrides, validateMorphOverrides } from "./morphOverrides.js";

import type { MmdCameraState, MmdLightState, MmdAnimation } from "../parser/model/modelTypes.js";
import type { MmdPhysicsBackend } from "../physics/index.js";
import { sampleMmdCameraTrackInto, sampleMmdLightTrackInto } from "./sceneTrackSampling.js";
import { DefaultMmdRuntime } from "./core.js";
import { ExternalPhysicsStepper } from "./externalPhysicsStepper.js";
import { normalizeFrameRate } from "./math.js";
import { syncMorphSplitTargetInfluences } from "./morphSplitSync.js";
import type { MmdHostRigDefinition, MmdHostRigPose, MmdAnimRuntimeWasmHostRig } from "./hostRig.js";
import { HostRigPhysics } from "./hostRigPhysics.js";
import { readRuntimeExternalPhysics } from "./physics.js";
import { captureRuntimeDebugStageInto, copyArrayLikeToNumberArray } from "./debugState.js";
import { createPhysicsResetContext } from "./physicsPose.js";
import type {
  MmdFrameState,
  MmdRuntime,
  MmdRuntimeDebugState,
  MmdRuntimeEvaluateOptions,
  MmdRuntimeTickOptions
} from "./types.js";

import type {
  MmdAnimRuntimeWasmModel,
  MmdAnimRuntimeWasmClip,
  MmdAnimRuntimeWasmCameraTrack,
  MmdAnimRuntimeWasmLightTrack,
  MmdAnimRuntimeWasmRuntimeInstance,
  MmdAnimRuntimeWasmModule
} from "./mmdAnimWasm.js";
import { createWasmModelFromPmxBytes, createWasmRuntime } from "./mmdAnimWasm.js";
import {
  createMmdAnimWasmCameraTrack,
  createMmdAnimWasmLightTrack,
  sampleMmdAnimWasmCameraTrackInto,
  sampleMmdAnimWasmLightTrackInto
} from "./mmdAnimTracks.js";
import {
  syncWorldMatricesToSkeleton,
  writeParentBoneIndices,
  syncMorphWeights,
  syncRuntimeObjectForRender,
  ensureScratchMatrixArrayLength,
  isObject3D,
  isSkinnedMesh
} from "./mmdAnimMesh.js";

type MutableFrameState = {
  -readonly [K in keyof MmdFrameState]: MmdFrameState[K];
};

type MutableDebugStages = {
  -readonly [K in keyof MmdRuntimeDebugState["stages"]]: MmdAnimRuntimeDebugStageState;
};

const defaultMmdAnimIkTolerance = 1.0e-2;
const emptyBonePhysicsToggles = Object.freeze({});

interface MmdAnimRuntimeDebugStageState {
  worldMatricesColumnMajor: number[];
  morphWeights: number[];
}

export interface MmdAnimRuntimeOptions {
  /** mmd-anim WASM module namespace. */
  readonly wasm?: MmdAnimRuntimeWasmModule;
  /** Prebuilt mmd-anim model. If omitted, wasm.WasmMmdModel.fromPmxBytes and pmxBytes are required. */
  readonly model?: MmdAnimRuntimeWasmModel;
  /** PMX bytes used to create a wasm model when model is omitted. */
  readonly pmxBytes?: Uint8Array;
  /** Optional prebuilt clip. setAnimation replaces this with a VMD-derived clip when possible. */
  readonly clip?: MmdAnimRuntimeWasmClip;
  /** MMD timeline frame rate. Defaults to 30. */
  readonly frameRate?: number;
  /** Initial runtime time in seconds. Defaults to 0. */
  readonly initialSeconds?: number;
  /** Physics integration mode. Defaults to "none". */
  readonly physics?: "none" | "external";
  /** External physics backend used when physics is "external". */
  readonly physicsBackend?: MmdPhysicsBackend;
  /** Optional IK solve tolerance override for mmd-anim WASM. Uses the wasm default when omitted. */
  readonly ikTolerance?: number;
  /** Optional IK max-iteration cap override for mmd-anim WASM. Uses the wasm default when omitted. */
  readonly ikMaxIterationsCap?: number;
  /** Own and free the wasm model/runtime/created clips on dispose. Defaults to true. */
  readonly ownsWasmResources?: boolean;
}

/**
 * Default runtime for PMX models loaded by ThreeMmdLoader, backed by the mmd-anim WASM evaluator.
 *
 * The adapter intentionally accepts structural wasm types instead of importing
 * a package name, so local harness builds and future published artifacts can be
 * tested without changing this package's dependency graph.
 */
export class MmdAnimRuntime implements MmdRuntime {
  private hostRig: MmdAnimRuntimeWasmHostRig | undefined;
  private hostRigPhysics: HostRigPhysics | undefined;
  private hostPose: MmdHostRigPose | undefined;
  private hostIkDisabled = new Uint8Array(0);
  private readonly frameRate: number;
  private readonly wasm: MmdAnimRuntimeWasmModule | undefined;
  private readonly wasmModel: MmdAnimRuntimeWasmModel;
  private readonly wasmRuntime: MmdAnimRuntimeWasmRuntimeInstance;
  private readonly ownsWasmResources: boolean;
  private readonly physicsMode: "none" | "external";
  private readonly physicsBackend: MmdPhysicsBackend | undefined;
  private readonly ikTolerance: number | undefined;
  private readonly ikMaxIterationsCap: number | undefined;
  private readonly state: MutableFrameState;
  private readonly evaluateReturnState: MutableFrameState = {
    seconds: 0,
    frame: 0,
    frameRate: 30
  };
  private worldMatrices: Float32Array;
  private morphWeights: Float32Array;
  private readonly hostMorphWeights: Float32Array;
  private readonly debugStages: MutableDebugStages = createEmptyDebugStages();
  private readonly scratchWorldMatrices: THREE.Matrix4[] = [];
  private readonly scratchThreeWorldMatrix = new THREE.Matrix4();
  private readonly scratchLocalMatrix = new THREE.Matrix4();
  private readonly scratchParentInverseMatrix = new THREE.Matrix4();
  private readonly scratchParentBoneIndices: number[] = [];
  private readonly scratchCameraState: MmdCameraState = {
    distance: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    fov: 1,
    perspective: true
  };
  private readonly scratchCameraSample = new Float32Array(9);
  private readonly scratchCameraFrameHint = { index: 0 };
  private readonly scratchLightState: MmdLightState = {
    color: [0, 0, 0],
    direction: [0, 0, 0]
  };
  private readonly scratchLightSample = new Float32Array(6);
  private wasmClip: MmdAnimRuntimeWasmClip | undefined;
  private wasmCameraTrack: MmdAnimRuntimeWasmCameraTrack | undefined;
  private wasmLightTrack: MmdAnimRuntimeWasmLightTrack | undefined;
  private ownsWasmClip = false;
  private mesh: THREE.SkinnedMesh | undefined;
  private mmdAnimation: MmdAnimation | undefined;
  private parsedTrackRuntime: DefaultMmdRuntime | undefined;
  private readonly externalPhysicsStepper: ExternalPhysicsStepper;
  private physicsDisabled = false;
  private _restPoseDirty = true;

  constructor(options: MmdAnimRuntimeOptions) {
    this.frameRate = normalizeFrameRate(options.frameRate ?? 30);
    this.wasm = options.wasm;
    this.wasmModel = options.model ?? createWasmModelFromPmxBytes(options.wasm, options.pmxBytes);
    this.wasmRuntime = createWasmRuntime(options.wasm, this.wasmModel);
    this.ownsWasmResources = options.ownsWasmResources ?? true;
    this.physicsMode = options.physics ?? "none";
    this.physicsBackend = options.physicsBackend;
    this.externalPhysicsStepper = new ExternalPhysicsStepper(this.physicsBackend, { directBuffers: false });
    this.ikTolerance = readNonNegativeOptionalNumber(options.ikTolerance, "MmdAnimRuntime ikTolerance");
    this.ikMaxIterationsCap = readNonNegativeIntegerOptionalNumber(
      options.ikMaxIterationsCap,
      "MmdAnimRuntime ikMaxIterationsCap"
    );
    this.wasmClip = options.clip;
    this.worldMatrices = new Float32Array(this.wasmRuntime.worldMatrixF32Len());
    this.morphWeights = new Float32Array(this.wasmRuntime.morphWeightLen?.() ?? this.wasmModel.morphCount?.() ?? 0);
    this.hostMorphWeights = new Float32Array(this.morphWeights.length);
    this.state = createFrameState(options.initialSeconds ?? 0, this.frameRate);
  }

  static fromPmxBytes(
    wasm: MmdAnimRuntimeWasmModule,
    pmxBytes: Uint8Array,
    options: Omit<MmdAnimRuntimeOptions, "wasm" | "pmxBytes" | "model"> = {}
  ): MmdAnimRuntime {
    return new MmdAnimRuntime({ ...options, wasm, pmxBytes });
  }

  evaluate(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState {
    const overrides = options?.morphOverrides;
    validateMorphOverrides(overrides, this.hostMorphWeights.length);
    if (!this.hostRig && !this.parsedTrackRuntime && overrides?.indices.length) {
      const supported = this.wasmClip
        ? this.wasmRuntime.evaluateClipFrameWithMorphOverrides
        : this.wasmRuntime.evaluateRestPoseWithMorphOverrides;
      if (!supported) throw new Error("mmd-anim WASM must be rebuilt to support morph overrides");
    }
    if (this.hostRig) {
      return this.evaluateHostPose(seconds, options);
    }
    const previousSeconds = this.state.seconds;
    writeFrameState(this.state, seconds, this.frameRate);
    if (this.parsedTrackRuntime) {
      const state = this.parsedTrackRuntime.evaluate(seconds, options);
      return copyFrameStateInto(this.evaluateReturnState, state);
    }
    let poseEvaluated = false;
    if (overrides?.indices.length) {
      // Match ordinary clip/rest evaluation, including its default IK policy.
      const configuredIk = this.wasmClip && (this.ikTolerance !== undefined || this.ikMaxIterationsCap !== undefined);
      const tolerance = configuredIk ? this.ikTolerance ?? defaultMmdAnimIkTolerance : undefined;
      const cap = configuredIk ? this.ikMaxIterationsCap ?? 0 : 0;
      if (this.wasmClip) {
        this.wasmRuntime.evaluateClipFrameWithMorphOverrides?.(
          this.wasmClip, this.state.frame, overrides.indices, overrides.weights, tolerance, cap, options?.ik !== false
        );
      } else {
        this.wasmRuntime.evaluateRestPoseWithMorphOverrides?.(
          overrides.indices, overrides.weights, tolerance, cap, options?.ik !== false
        );
      }
      this._restPoseDirty = true;
      poseEvaluated = true;
    } else if (this.wasmClip) {
      this.evaluateWasmClipFrame(this.wasmClip, this.state.frame);
      poseEvaluated = true;
    } else if (this._restPoseDirty) {
      this.wasmRuntime.evaluateRestPose();
      this._restPoseDirty = false;
      poseEvaluated = true;
    }
    if (poseEvaluated) {
      this.copyWasmOutput();
      this.syncBoundMesh();
      this.captureDebugStage("vmdInterpolation");
      this.captureDebugStage("appendTransform");
      this.captureDebugStage("ik");
    }
    if (options?.physics === false) {
      if (!this.physicsDisabled) {
        this.resetPhysicsState();
      }
      this.physicsDisabled = true;
    } else {
      const mesh = this.mesh;
      if (mesh && this.externalPhysicsStepper.step(mesh, this.state, previousSeconds, emptyBonePhysicsToggles)) {
        mesh.skeleton.update();
      }
      this.physicsDisabled = false;
    }
    this.capturePhysicsDebugStage();
    this.externalPhysicsStepper.markEvaluated(options?.physics === false ? undefined : this.state.seconds);
    return copyFrameStateInto(this.evaluateReturnState, this.state);
  }

  /** Configure host evaluation and bind its display skeleton without a VMD clip. */
  setHostRig(definition: MmdHostRigDefinition, mesh: THREE.SkinnedMesh): void {
    if (this.physicsMode === "external" && !this.physicsBackend) {
      throw new TypeError("MmdAnimRuntime host rigs require a physicsBackend for external physics");
    }
    if (!isSkinnedMesh(mesh) || mesh.skeleton.bones.length !== this.wasmModel.boneCount()) {
      throw new TypeError("MmdAnimRuntime host rig mesh must match the model bone count and order");
    }
    const Rig = this.wasm?.WasmMmdHostRig;
    if (!Rig) {
      throw new TypeError("mmd-anim wasm module does not expose WasmMmdHostRig");
    }
    const rig = new Rig(this.wasmModel, definition.drivenBoneIndices, definition.goalBoneIndices);
    if (this.physicsMode === "external" && !rig.evaluateWithExternalPhysics) {
      rig.free();
      throw new TypeError("mmd-anim wasm host rig does not expose evaluateWithExternalPhysics");
    }
    this.clearHostRig();
    this.clearAnimation();
    this.hostRig = rig;
    // Keep the ordinary path bound to the same mesh when the rig is cleared.
    const data = this.physicsMode === "external" && this.physicsBackend
      ? readRuntimeExternalPhysics(mesh)
      : undefined;
    this.externalPhysicsStepper.bind(data);
    if (data && this.physicsBackend) {
      this.hostRigPhysics = new HostRigPhysics(this.physicsBackend, data, definition.drivenBoneIndices);
      this.hostRigPhysics.reset();
    }
    this.hostIkDisabled = new Uint8Array(this.wasmModel.ikCount?.() ?? 0);
    this.mesh = mesh;
    writeParentBoneIndices(mesh.skeleton.bones, this.scratchParentBoneIndices);
    ensureScratchMatrixArrayLength(this.scratchWorldMatrices, mesh.skeleton.bones.length);
  }

  /** Retains caller-owned buffers; populate them before every evaluate/tick call. */
  setHostPose(pose: MmdHostRigPose): void {
    if (!this.hostRig) {
      throw new TypeError("MmdAnimRuntime setHostRig must precede setHostPose");
    }
    this.hostPose = pose;
  }

  /** Release the configured rig and return to ordinary rest/VMD evaluation. */
  clearHostRig(): void {
    if (this.hostRig) {
      this.externalPhysicsStepper.markEvaluated(undefined);
      this.physicsDisabled = false;
    }
    this.hostRigPhysics?.reset();
    this.hostRigPhysics = undefined;
    this.hostRig?.free();
    this.hostRig = undefined;
    this.hostPose = undefined;
    this._restPoseDirty = true;
  }

  private evaluateHostPose(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState {
    if (!Number.isFinite(seconds)) {
      throw new RangeError("MmdAnimRuntime seconds must be finite");
    }
    const rig = this.hostRig;
    const pose = this.hostPose;
    if (!rig || !pose) {
      throw new TypeError("MmdAnimRuntime host rig requires a fresh base pose");
    }
    let morphWeights = pose.morphWeights;
    if (options?.morphOverrides?.indices.length) {
      if (morphWeights.length !== this.hostMorphWeights.length) {
        throw new RangeError("Host pose morph count must match the model");
      }
      this.hostMorphWeights.set(morphWeights);
      applyMorphOverrides(this.hostMorphWeights, options.morphOverrides);
      morphWeights = this.hostMorphWeights;
    }
    const physics = options?.physics === false ? undefined : this.hostRigPhysics;
    if (physics && rig.evaluateWithExternalPhysics) {
      physics.prepare(seconds, this.frameRate);
      try {
        rig.evaluateWithExternalPhysics(
          this.wasmRuntime, pose.positions, pose.rotations, pose.scales,
          morphWeights, options?.ik === false ? this.hostIkDisabled : pose.ikEnabled,
          this.ikTolerance ?? defaultMmdAnimIkTolerance, this.ikMaxIterationsCap ?? 0,
          physics.step
        );
        physics.commit();
      } catch (error) {
        // A failed callback may have advanced the solver. Recover by reseeding
        // on the next frame; the display remains at its last successful pose.
        physics.reset();
        throw error;
      }
    } else {
      this.hostRigPhysics?.reset();
      rig.evaluate(
        this.wasmRuntime, pose.positions, pose.rotations, pose.scales,
        morphWeights, options?.ik === false ? this.hostIkDisabled : pose.ikEnabled,
        this.ikTolerance ?? defaultMmdAnimIkTolerance, this.ikMaxIterationsCap ?? 0
      );
    }
    writeFrameState(this.state, seconds, this.frameRate);
    this.copyWasmOutput();
    this.syncBoundMesh();
    this.captureDebugStage("vmdInterpolation");
    this.captureDebugStage("appendTransform");
    this.captureDebugStage("ik");
    this.capturePhysicsDebugStage();
    return copyFrameStateInto(this.evaluateReturnState, this.state);
  }

  tick(seconds: number, options?: MmdRuntimeTickOptions): MmdFrameState;
  /**
   * @deprecated Use tick(seconds, { mesh, ...options }) instead.
   */
  tick(
    seconds: number,
    mesh: THREE.Object3D | null | undefined,
    options?: MmdRuntimeEvaluateOptions
  ): MmdFrameState;
  tick(
    seconds: number,
    meshOrOptions?: THREE.Object3D | MmdRuntimeTickOptions | null,
    options?: MmdRuntimeEvaluateOptions
  ): MmdFrameState {
    let renderObject: THREE.Object3D | null | undefined;
    let evaluateOptions: MmdRuntimeEvaluateOptions | undefined;
    if (isObject3D(meshOrOptions)) {
      renderObject = meshOrOptions;
      evaluateOptions = options;
    } else if (meshOrOptions == null) {
      renderObject = undefined;
      evaluateOptions = options;
    } else {
      renderObject = meshOrOptions.mesh;
      evaluateOptions = meshOrOptions;
    }
    const state = this.evaluate(seconds, evaluateOptions);
    syncRuntimeObjectForRender(renderObject ?? this.mesh);
    return state;
  }

  seek(seconds: number): MmdFrameState {
    writeFrameState(this.state, seconds, this.frameRate);
    this.wasmRuntime.resetIkHistory?.();
    this.hostRigPhysics?.reset();
    this.parsedTrackRuntime?.seek(seconds);
    return copyFrameStateInto(this.evaluateReturnState, this.state);
  }

  resetPose(): void {
    this.wasmRuntime.resetIkHistory?.();
    this.hostRigPhysics?.reset();
    this.hostPose = undefined;
    if (this.parsedTrackRuntime) {
      this.parsedTrackRuntime.resetPose();
      return;
    }
    this._restPoseDirty = true;
    this.wasmRuntime.evaluateRestPose();
    this._restPoseDirty = false;
    this.copyWasmOutput();
    this.syncBoundMesh();
  }

  clearAnimation(): void {
    this.releaseOwnedClip();
    this.releaseCameraTrack();
    this.releaseLightTrack();
    this.wasmClip = undefined;
    this.mmdAnimation = undefined;
    this.parsedTrackRuntime = undefined;
    this.scratchCameraFrameHint.index = 0;
    this._restPoseDirty = true;
  }

  cameraState(): MmdCameraState | undefined {
    if (this.parsedTrackRuntime) {
      return this.parsedTrackRuntime.cameraState();
    }
    if (this.wasmCameraTrack) {
      return sampleMmdAnimWasmCameraTrackInto(
        this.wasmCameraTrack,
        this.state.frame,
        this.scratchCameraSample,
        this.scratchCameraState
      );
    }
    const frames = this.mmdAnimation?.cameraFrames;
    if (!frames || frames.length === 0) {
      this.scratchCameraFrameHint.index = 0;
      return undefined;
    }
    return sampleMmdCameraTrackInto(
      frames,
      this.state.frame,
      this.scratchCameraState,
      this.scratchCameraFrameHint
    );
  }

  lightState(): MmdLightState | undefined {
    if (this.parsedTrackRuntime) {
      return this.parsedTrackRuntime.lightState();
    }
    if (this.wasmLightTrack) {
      return sampleMmdAnimWasmLightTrackInto(
        this.wasmLightTrack,
        this.state.frame,
        this.scratchLightSample,
        this.scratchLightState
      );
    }
    const frames = this.mmdAnimation?.lightFrames;
    if (!frames || frames.length === 0) {
      return undefined;
    }
    return sampleMmdLightTrackInto(frames, this.state.frame, this.scratchLightState);
  }

  /** @deprecated Prefer seek / resetPose / clearAnimation for finer control. */
  reset(seconds = 0): MmdFrameState {
    this.seek(seconds);
    this.resetPose();
    this.clearAnimation();
    return copyFrameStateInto(this.evaluateReturnState, this.state);
  }

  setAnimation(animation: MmdAnimation, mesh: THREE.SkinnedMesh): void {
    if (!isSkinnedMesh(mesh)) {
      throw new TypeError("MmdAnimRuntime mesh must be a THREE.SkinnedMesh");
    }
    if (animation.kind !== "vmd") {
      throw new TypeError("MmdAnimRuntime animation must be an MmdAnimation");
    }
    this.wasmRuntime.resetIkHistory?.();
    this.clearHostRig();
    this._restPoseDirty = true;
    this.mesh = mesh;
    this.mmdAnimation = animation;
    this.parsedTrackRuntime = undefined;
    this.scratchCameraFrameHint.index = 0;
    this.releaseCameraTrack();
    this.releaseLightTrack();
    writeParentBoneIndices(mesh.skeleton.bones, this.scratchParentBoneIndices);
    this.externalPhysicsStepper.bind(
      this.physicsMode === "external" && this.physicsBackend
        ? readRuntimeExternalPhysics(mesh)
        : undefined
    );
    this.resetPhysicsState();
    this.externalPhysicsStepper.markEvaluated(undefined);
    this.physicsDisabled = false;
    if (hasParsedModelTracks(animation) && !isLikelyVmdBytes(animation.bytes)) {
      this.releaseOwnedClip();
      this.wasmClip = undefined;
      this.externalPhysicsStepper.bind(undefined);
      this.parsedTrackRuntime = new DefaultMmdRuntime({
        frameRate: this.frameRate,
        initialSeconds: this.state.seconds,
        physics: this.physicsMode === "external" ? "external" : "none",
        physicsBackend: this.physicsBackend
      });
      this.parsedTrackRuntime.setAnimation(animation, mesh);
      return;
    }
    if (!(animation.bytes instanceof Uint8Array) || animation.bytes.byteLength === 0) {
      this.releaseOwnedClip();
      this.wasmClip = undefined;
      return;
    }
    const clipFactory = this.wasm?.WasmMmdClip?.fromVmdBytesForModel;
    if (clipFactory) {
      this.releaseOwnedClip();
      this.wasmClip = clipFactory(this.wasmModel, animation.bytes);
      this.ownsWasmClip = true;
    }
    if (animation.metadata.counts.cameras > 0 || animation.cameraFrames.length > 0) {
      try {
        this.wasmCameraTrack = createMmdAnimWasmCameraTrack(this.wasm ?? {}, animation.bytes);
      } catch {
        this.wasmCameraTrack = undefined;
      }
    }
    if (animation.metadata.counts.lights > 0 || animation.lightFrames.length > 0) {
      try {
        this.wasmLightTrack = createMmdAnimWasmLightTrack(this.wasm ?? {}, animation.bytes);
      } catch {
        this.wasmLightTrack = undefined;
      }
    }
  }

  frameState(): MmdFrameState {
    return { ...this.state };
  }

  debugState(): MmdRuntimeDebugState {
    if (this.parsedTrackRuntime) {
      return this.parsedTrackRuntime.debugState();
    }
    return {
      stages: {
        vmdInterpolation: cloneDebugStage(this.debugStages.vmdInterpolation),
        appendTransform: cloneDebugStage(this.debugStages.appendTransform),
        ik: cloneDebugStage(this.debugStages.ik),
        physics: cloneDebugStage(this.debugStages.physics)
      }
    };
  }

  debugRigidBodyWorldTransformsColumnMajor(): readonly (readonly number[])[] {
    if (this.parsedTrackRuntime) {
      return this.parsedTrackRuntime.debugRigidBodyWorldTransformsColumnMajor();
    }
    return this.physicsBackend?.debugRigidBodyWorldTransformsColumnMajor?.() ?? [];
  }

  dispose(): void {
    this.clearHostRig();
    this.releaseOwnedClip();
    this.releaseCameraTrack();
    this.releaseLightTrack();
    if (!this.ownsWasmResources) {
      return;
    }
    this.wasmRuntime.free?.();
    this.wasmModel.free?.();
  }

  private copyWasmOutput(): void {
    const worldMatricesView = this.wasmRuntime.worldMatricesView?.();
    if (worldMatricesView) {
      if (worldMatricesView.length < this.wasmRuntime.worldMatrixF32Len()) {
        throw new RangeError("MmdAnimRuntime world matrix view is too short");
      }
      this.worldMatrices = worldMatricesView;
    } else if (!this.wasmRuntime.copyWorldMatrices(this.worldMatrices)) {
      throw new RangeError("MmdAnimRuntime world matrix buffer is too short");
    }
    const morphWeightsView = this.wasmRuntime.morphWeightsView?.();
    if (morphWeightsView) {
      this.morphWeights = morphWeightsView;
    } else {
      this.wasmRuntime.copyMorphWeights?.(this.morphWeights);
    }
  }

  private evaluateWasmClipFrame(clip: MmdAnimRuntimeWasmClip, frame: number): void {
    if (this.ikTolerance === undefined && this.ikMaxIterationsCap === undefined) {
      this.wasmRuntime.evaluateClipFrame(clip, frame);
      return;
    }
    const evaluateWithIkOptions = this.wasmRuntime.evaluateClipFrameWithIkOptions;
    if (!evaluateWithIkOptions) {
      throw new TypeError("mmd-anim wasm runtime does not expose evaluateClipFrameWithIkOptions");
    }
    evaluateWithIkOptions.call(
      this.wasmRuntime,
      clip,
      frame,
      this.ikTolerance ?? defaultMmdAnimIkTolerance,
      this.ikMaxIterationsCap ?? 0
    );
  }

  private syncBoundMesh(): void {
    const mesh = this.mesh;
    if (!mesh) {
      return;
    }
    syncWorldMatricesToSkeleton(
      mesh,
      this.worldMatrices,
      this.scratchWorldMatrices,
      this.scratchParentBoneIndices,
      this.scratchThreeWorldMatrix,
      this.scratchLocalMatrix,
      this.scratchParentInverseMatrix
    );
    syncMorphWeights(mesh, this.morphWeights);
    syncMorphSplitTargetInfluences(mesh);
  }

  private captureDebugStage(stage: keyof MmdRuntimeDebugState["stages"]): void {
    const target = this.debugStages[stage];
    copyArrayLikeToNumberArray(this.worldMatrices, target.worldMatricesColumnMajor);
    copyArrayLikeToNumberArray(this.morphWeights, target.morphWeights);
  }

  private capturePhysicsDebugStage(): void {
    const mesh = this.mesh;
    if (!mesh) {
      this.captureDebugStage("physics");
      return;
    }
    captureRuntimeDebugStageInto(mesh, this.debugStages.physics);
  }

  private resetPhysicsState(): void {
    this.physicsBackend?.reset?.(createPhysicsResetContext(this.state));
  }


  private releaseOwnedClip(): void {
    if (this.ownsWasmClip) {
      this.wasmClip?.free?.();
    }
    this.ownsWasmClip = false;
  }

  private releaseCameraTrack(): void {
    this.wasmCameraTrack?.free?.();
    this.wasmCameraTrack = undefined;
  }

  private releaseLightTrack(): void {
    this.wasmLightTrack?.free?.();
    this.wasmLightTrack = undefined;
  }
}

function hasParsedModelTracks(animation: MmdAnimation): boolean {
  return Object.keys(animation.boneTracks).length > 0 || Object.keys(animation.morphTracks).length > 0;
}

function isLikelyVmdBytes(bytes: Uint8Array): boolean {
  const header = "Vocaloid Motion Data";
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < header.length) {
    return false;
  }
  for (let index = 0; index < header.length; index += 1) {
    if (bytes[index] !== header.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

function createEmptyDebugStages(): MutableDebugStages {
  return {
    vmdInterpolation: createEmptyDebugStage(),
    appendTransform: createEmptyDebugStage(),
    ik: createEmptyDebugStage(),
    physics: createEmptyDebugStage()
  };
}

function createEmptyDebugStage(): MmdAnimRuntimeDebugStageState {
  return {
    worldMatricesColumnMajor: [],
    morphWeights: []
  };
}

function cloneDebugStage(
  stage: MmdAnimRuntimeDebugStageState
): MmdRuntimeDebugState["stages"]["physics"] {
  return {
    worldMatricesColumnMajor: Array.from(stage.worldMatricesColumnMajor),
    morphWeights: Array.from(stage.morphWeights)
  };
}

function createFrameState(seconds: number, frameRate: number): MutableFrameState {
  return writeFrameState(
    {
      seconds: 0,
      frame: 0,
      frameRate: 30
    },
    seconds,
    frameRate
  );
}

function writeFrameState(
  target: MutableFrameState,
  seconds: number,
  frameRate: number
): MutableFrameState {
  if (!Number.isFinite(seconds)) {
    throw new RangeError("MmdAnimRuntime seconds must be finite");
  }
  target.seconds = seconds;
  target.frame = seconds * frameRate;
  target.frameRate = frameRate;
  return target;
}

function readNonNegativeOptionalNumber(value: number | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number`);
  }
  return value;
}

function readNonNegativeIntegerOptionalNumber(
  value: number | undefined,
  label: string
): number | undefined {
  const parsed = readNonNegativeOptionalNumber(value, label);
  if (parsed === undefined) {
    return undefined;
  }
  if (!Number.isInteger(parsed)) {
    throw new RangeError(`${label} must be an integer`);
  }
  return parsed;
}

function copyFrameStateInto(
  target: MutableFrameState,
  source: MmdFrameState
): MmdFrameState {
  target.seconds = source.seconds;
  target.frame = source.frame;
  target.frameRate = source.frameRate;
  return target;
}
