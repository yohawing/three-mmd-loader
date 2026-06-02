import * as THREE from "three";

import type { MmdAnimation } from "../parser/model/modelTypes.js";
import { writeBonePhysicsToggleBuffer } from "../physics/legacyPhysicsBridge.js";
import type { MmdPhysicsBackend, MmdPhysicsStepContext } from "../physics/index.js";
import { copyNumbersToFloat32Scratch, ensureFloat32ArrayLength, normalizeFrameRate, threeQuaternionToMmd, writeQuaternionToBuffer, writeVector3ToBuffer } from "./math.js";
import { applyPhysicsOutputToSkeleton, captureRuntimeDebugStageInto, createPhysicsResetContext, createPrePhysicsInputBuffersIfNeeded, extractMmdWorldMatricesInto, mergePhysicsOutputDeltas, readRuntimeExternalPhysics } from "./physics.js";
import type { PrePhysicsScratch } from "./physics.js";
import type {
  MmdFrameState,
  MmdRuntime,
  MmdRuntimeDebugState,
  MmdRuntimeEvaluateOptions,
  MmdRuntimeTickOptions,
  RuntimeExternalPhysicsData
} from "./types.js";

type MutableFrameState = {
  -readonly [K in keyof MmdFrameState]: MmdFrameState[K];
};

type MutableDebugStages = {
  -readonly [K in keyof MmdRuntimeDebugState["stages"]]: CustomRuntimeDebugStageState;
};

interface CustomRuntimeDebugStageState {
  worldMatricesColumnMajor: number[];
  morphWeights: number[];
}

export interface CustomRuntimeWasmModel {
  boneCount(): number;
  morphCount?(): number;
  ikCount?(): number;
  free?(): void;
}

export interface CustomRuntimeWasmClip {
  free?(): void;
}

export interface CustomRuntimeWasmRuntimeInstance {
  evaluateRestPose(): void;
  evaluateClipFrame(clip: CustomRuntimeWasmClip, frame: number): void;
  worldMatrixF32Len(): number;
  copyWorldMatrices(out: Float32Array): boolean;
  morphWeightLen?(): number;
  copyMorphWeights?(out: Float32Array): boolean;
  free?(): void;
}

export interface CustomRuntimeWasmModule {
  readonly WasmMmdModel?: {
    fromPmxBytes?(bytes: Uint8Array): CustomRuntimeWasmModel;
  };
  readonly WasmMmdClip?: {
    fromVmdBytesForModel?(model: CustomRuntimeWasmModel, bytes: Uint8Array): CustomRuntimeWasmClip;
  };
  readonly WasmMmdRuntimeInstance: {
    forModel?(model: CustomRuntimeWasmModel): CustomRuntimeWasmRuntimeInstance;
    new(model: CustomRuntimeWasmModel, morphCount: number): CustomRuntimeWasmRuntimeInstance;
  };
}

export interface CustomRuntimeOptions {
  /** mmd-runtime WASM module namespace. */
  readonly wasm?: CustomRuntimeWasmModule;
  /** Prebuilt mmd-runtime model. If omitted, wasm.WasmMmdModel.fromPmxBytes and pmxBytes are required. */
  readonly model?: CustomRuntimeWasmModel;
  /** PMX bytes used to create a wasm model when model is omitted. */
  readonly pmxBytes?: Uint8Array;
  /** Optional prebuilt clip. setAnimation replaces this with a VMD-derived clip when possible. */
  readonly clip?: CustomRuntimeWasmClip;
  /** MMD timeline frame rate. Defaults to 30. */
  readonly frameRate?: number;
  /** Initial runtime time in seconds. Defaults to 0. */
  readonly initialSeconds?: number;
  /** Physics integration mode. Defaults to "none". */
  readonly physics?: "none" | "external";
  /** External physics backend used when physics is "external". */
  readonly physicsBackend?: MmdPhysicsBackend;
  /** Own and free the wasm model/runtime/created clips on dispose. Defaults to true. */
  readonly ownsWasmResources?: boolean;
}

/**
 * Experimental runtime adapter for the adjacent mmd-runtime WASM evaluator.
 *
 * The adapter intentionally accepts structural wasm types instead of importing
 * a package name, so local harness builds and future published artifacts can be
 * tested without changing this package's dependency graph.
 */
export class CustomRuntime implements MmdRuntime {
  private readonly frameRate: number;
  private readonly wasm: CustomRuntimeWasmModule | undefined;
  private readonly wasmModel: CustomRuntimeWasmModel;
  private readonly wasmRuntime: CustomRuntimeWasmRuntimeInstance;
  private readonly ownsWasmResources: boolean;
  private readonly physicsMode: "none" | "external";
  private readonly physicsBackend: MmdPhysicsBackend | undefined;
  private readonly state: MutableFrameState;
  private readonly evaluateReturnState: MutableFrameState = {
    seconds: 0,
    frame: 0,
    frameRate: 30
  };
  private readonly worldMatrices: Float32Array;
  private readonly morphWeights: Float32Array;
  private readonly debugStages: MutableDebugStages = createEmptyDebugStages();
  private readonly scratchWorldMatrices: THREE.Matrix4[] = [];
  private readonly scratchThreeWorldMatrix = new THREE.Matrix4();
  private readonly scratchLocalMatrix = new THREE.Matrix4();
  private readonly scratchParentInverseMatrix = new THREE.Matrix4();
  private readonly scratchExternalPhysicsInput = {
    translations: new Float32Array(0),
    rotations: new Float32Array(0),
    worldMatricesColumnMajor: new Float32Array(0),
    outputTranslations: new Float32Array(0),
    outputRotations: new Float32Array(0),
    outputWorldMatricesColumnMajor: new Float32Array(0),
    updatedBoneIndices: [] as number[],
    bonePhysicsToggleBuffer: new Uint8Array(0),
    worldMatricesColumnMajorNumbers: [] as number[]
  };
  private readonly scratchPrePhysics: PrePhysicsScratch = {
    preTranslations: new Float32Array(0),
    preRotations: new Float32Array(0),
    preWorldMatricesColumnMajor: new Float32Array(0),
    composeWorldPositions: [],
    composeWorldRotations: [],
    composeMatrix: new THREE.Matrix4(),
    composeUnitScale: new THREE.Vector3(1, 1, 1),
    mergeTargetRotation: new THREE.Quaternion(),
    mergePreRotation: new THREE.Quaternion(),
    mergePhysicsRotation: new THREE.Quaternion(),
    localPosition: new THREE.Vector3(),
    localRotation: new THREE.Quaternion()
  };
  private wasmClip: CustomRuntimeWasmClip | undefined;
  private ownsWasmClip = false;
  private mesh: THREE.SkinnedMesh | undefined;
  private externalPhysicsData: RuntimeExternalPhysicsData | undefined;
  private previousEvaluateSeconds: number | undefined;
  private physicsDisabled = false;

  constructor(options: CustomRuntimeOptions) {
    this.frameRate = normalizeFrameRate(options.frameRate ?? 30);
    this.wasm = options.wasm;
    this.wasmModel = options.model ?? createWasmModelFromPmxBytes(options.wasm, options.pmxBytes);
    this.wasmRuntime = createWasmRuntime(options.wasm, this.wasmModel);
    this.ownsWasmResources = options.ownsWasmResources ?? true;
    this.physicsMode = options.physics ?? "none";
    this.physicsBackend = options.physicsBackend;
    this.wasmClip = options.clip;
    this.worldMatrices = new Float32Array(this.wasmRuntime.worldMatrixF32Len());
    this.morphWeights = new Float32Array(this.wasmRuntime.morphWeightLen?.() ?? this.wasmModel.morphCount?.() ?? 0);
    this.state = createFrameState(options.initialSeconds ?? 0, this.frameRate);
  }

  static fromPmxBytes(
    wasm: CustomRuntimeWasmModule,
    pmxBytes: Uint8Array,
    options: Omit<CustomRuntimeOptions, "wasm" | "pmxBytes" | "model"> = {}
  ): CustomRuntime {
    return new CustomRuntime({ ...options, wasm, pmxBytes });
  }

  evaluate(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState {
    const previousSeconds = this.state.seconds;
    writeFrameState(this.state, seconds, this.frameRate);
    if (this.wasmClip) {
      this.wasmRuntime.evaluateClipFrame(this.wasmClip, this.state.frame);
    } else {
      this.wasmRuntime.evaluateRestPose();
    }
    this.copyWasmOutput();
    this.syncBoundMesh();
    this.captureDebugStage("vmdInterpolation");
    this.captureDebugStage("appendTransform");
    this.captureDebugStage("ik");
    if (options?.physics === false) {
      if (!this.physicsDisabled) {
        this.resetPhysicsState();
      }
      this.physicsDisabled = true;
    } else {
      this.stepExternalPhysics(previousSeconds);
      this.physicsDisabled = false;
    }
    this.capturePhysicsDebugStage();
    this.previousEvaluateSeconds = options?.physics === false ? undefined : this.state.seconds;
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
    return copyFrameStateInto(this.evaluateReturnState, this.state);
  }

  resetPose(): void {
    this.wasmRuntime.evaluateRestPose();
    this.copyWasmOutput();
    this.syncBoundMesh();
  }

  clearAnimation(): void {
    this.releaseOwnedClip();
    this.wasmClip = undefined;
  }

  reset(seconds = 0): MmdFrameState {
    this.seek(seconds);
    this.resetPose();
    this.clearAnimation();
    return copyFrameStateInto(this.evaluateReturnState, this.state);
  }

  setAnimation(animation: MmdAnimation, mesh: THREE.SkinnedMesh): void {
    if (!isSkinnedMesh(mesh)) {
      throw new TypeError("CustomRuntime mesh must be a THREE.SkinnedMesh");
    }
    if (animation.kind !== "vmd") {
      throw new TypeError("CustomRuntime animation must be an MmdAnimation");
    }
    this.mesh = mesh;
    this.externalPhysicsData =
      this.physicsMode === "external" && this.physicsBackend
        ? readRuntimeExternalPhysics(mesh)
        : undefined;
    this.resetPhysicsState();
    this.previousEvaluateSeconds = undefined;
    this.physicsDisabled = false;
    if (!(animation.bytes instanceof Uint8Array) || animation.bytes.byteLength === 0) {
      this.clearAnimation();
      return;
    }
    const clipFactory = this.wasm?.WasmMmdClip?.fromVmdBytesForModel;
    if (clipFactory) {
      this.releaseOwnedClip();
      this.wasmClip = clipFactory(this.wasmModel, animation.bytes);
      this.ownsWasmClip = true;
    }
  }

  frameState(): MmdFrameState {
    return { ...this.state };
  }

  debugState(): MmdRuntimeDebugState {
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
    return this.physicsBackend?.debugRigidBodyWorldTransformsColumnMajor?.() ?? [];
  }

  dispose(): void {
    this.releaseOwnedClip();
    if (!this.ownsWasmResources) {
      return;
    }
    this.wasmRuntime.free?.();
    this.wasmModel.free?.();
  }

  private copyWasmOutput(): void {
    if (!this.wasmRuntime.copyWorldMatrices(this.worldMatrices)) {
      throw new RangeError("CustomRuntime world matrix buffer is too short");
    }
    this.wasmRuntime.copyMorphWeights?.(this.morphWeights);
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
      this.scratchThreeWorldMatrix,
      this.scratchLocalMatrix,
      this.scratchParentInverseMatrix
    );
    syncMorphWeights(mesh, this.morphWeights);
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

  private stepExternalPhysics(previousSeconds: number): void {
    const mesh = this.mesh;
    const data = this.externalPhysicsData;
    const backend = this.physicsBackend;
    if (this.physicsMode !== "external" || !mesh || !data || !backend || backend.disabled || backend.disposed) {
      return;
    }

    mesh.updateWorldMatrix(false, true);
    const boneCount = mesh.skeleton.bones.length;
    const inputTranslations = ensureFloat32ArrayLength(
      this.scratchExternalPhysicsInput.translations,
      boneCount * 3
    );
    this.scratchExternalPhysicsInput.translations = inputTranslations;
    inputTranslations.fill(0, 0, boneCount * 3);
    const inputRotations = ensureFloat32ArrayLength(
      this.scratchExternalPhysicsInput.rotations,
      boneCount * 4
    );
    this.scratchExternalPhysicsInput.rotations = inputRotations;
    inputRotations.fill(0, 0, boneCount * 4);
    for (let index = 0; index < boneCount; index += 1) {
      const bone = mesh.skeleton.bones[index];
      if (!bone) {
        continue;
      }
      writeVector3ToBuffer(inputTranslations, index, [
        bone.position.x,
        bone.position.y,
        -bone.position.z
      ]);
      writeQuaternionToBuffer(inputRotations, index, threeQuaternionToMmd(bone.quaternion));
    }
    const inputWorldMatricesColumnMajor = copyNumbersToFloat32Scratch(
      extractMmdWorldMatricesInto(mesh, this.scratchExternalPhysicsInput.worldMatricesColumnMajorNumbers),
      this.scratchExternalPhysicsInput.worldMatricesColumnMajor
    );
    this.scratchExternalPhysicsInput.worldMatricesColumnMajor = inputWorldMatricesColumnMajor;
    const prePhysics = createPrePhysicsInputBuffersIfNeeded(
      data.skeleton,
      inputTranslations,
      inputRotations,
      inputWorldMatricesColumnMajor,
      this.scratchPrePhysics
    );
    const physicsInputTranslations = prePhysics?.translations ?? inputTranslations;
    const physicsInputRotations = prePhysics?.rotations ?? inputRotations;
    const physicsInputWorldMatricesColumnMajor =
      prePhysics?.worldMatricesColumnMajor ?? inputWorldMatricesColumnMajor;
    const outputTranslations = copyFloat32ArrayToScratch(
      physicsInputTranslations,
      this.scratchExternalPhysicsInput.outputTranslations
    );
    this.scratchExternalPhysicsInput.outputTranslations = outputTranslations;
    const outputRotations = copyFloat32ArrayToScratch(
      physicsInputRotations,
      this.scratchExternalPhysicsInput.outputRotations
    );
    this.scratchExternalPhysicsInput.outputRotations = outputRotations;
    const outputWorldMatricesColumnMajor = copyFloat32ArrayToScratch(
      physicsInputWorldMatricesColumnMajor,
      this.scratchExternalPhysicsInput.outputWorldMatricesColumnMajor
    );
    this.scratchExternalPhysicsInput.outputWorldMatricesColumnMajor =
      outputWorldMatricesColumnMajor;
    if (this.scratchExternalPhysicsInput.bonePhysicsToggleBuffer.length < data.bones.length) {
      this.scratchExternalPhysicsInput.bonePhysicsToggleBuffer = new Uint8Array(data.bones.length);
    }
    const context: MmdPhysicsStepContext = {
      seconds: this.state.seconds,
      deltaSeconds: Math.max(0, this.state.seconds - previousSeconds),
      frame: this.state.frame,
      frameRate: this.state.frameRate,
      seeking:
        this.previousEvaluateSeconds === undefined ||
        this.state.seconds < this.previousEvaluateSeconds,
      skeleton: data.skeleton,
      rigidBodies: data.rigidBodies,
      joints: data.joints,
      inputTranslations: physicsInputTranslations,
      inputRotations: physicsInputRotations,
      inputWorldMatricesColumnMajor: physicsInputWorldMatricesColumnMajor,
      output: {
        translations: outputTranslations,
        rotations: outputRotations,
        worldMatricesColumnMajor: outputWorldMatricesColumnMajor,
        updatedBoneIndices: resetNumberArray(this.scratchExternalPhysicsInput.updatedBoneIndices)
      },
      bonePhysicsToggles: writeBonePhysicsToggleBuffer(
        data.bones,
        {},
        this.scratchExternalPhysicsInput.bonePhysicsToggleBuffer
      ),
      morphImpulses: data.morphImpulses
    };

    const result = backend.step(context);
    const updatedBoneCount = result.updatedBoneCount ?? context.output?.updatedBoneIndices?.length ?? 0;
    if (!result.simulated && updatedBoneCount === 0) {
      return;
    }
    if (prePhysics) {
      mergePhysicsOutputDeltas(
        context,
        inputTranslations,
        inputRotations,
        prePhysics,
        this.scratchPrePhysics
      );
    }
    applyPhysicsOutputToSkeleton(mesh, context, updatedBoneCount);
    mesh.skeleton.update();
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
}

function copyFloat32ArrayToScratch(
  source: Float32Array,
  scratch: Float32Array
): Float32Array<ArrayBuffer> {
  const target = ensureFloat32ArrayLength(scratch, source.length);
  target.set(source);
  return target;
}

function resetNumberArray(target: number[]): number[] {
  target.length = 0;
  return target;
}

function copyArrayLikeToNumberArray(values: ArrayLike<number>, target: number[]): number[] {
  target.length = values.length;
  for (let index = 0; index < values.length; index += 1) {
    target[index] = values[index];
  }
  return target;
}

function createWasmModelFromPmxBytes(
  wasm: CustomRuntimeWasmModule | undefined,
  bytes: Uint8Array | undefined
): CustomRuntimeWasmModel {
  const factory = wasm?.WasmMmdModel?.fromPmxBytes;
  if (!factory || !bytes) {
    throw new TypeError("CustomRuntime requires either a wasm model or wasm.WasmMmdModel.fromPmxBytes with pmxBytes");
  }
  return factory(bytes);
}

function createWasmRuntime(
  wasm: CustomRuntimeWasmModule | undefined,
  model: CustomRuntimeWasmModel
): CustomRuntimeWasmRuntimeInstance {
  const runtimeFactory = wasm?.WasmMmdRuntimeInstance;
  if (!runtimeFactory) {
    throw new TypeError("CustomRuntime requires wasm.WasmMmdRuntimeInstance");
  }
  return runtimeFactory.forModel?.(model) ?? new runtimeFactory(model, model.morphCount?.() ?? 0);
}

function syncWorldMatricesToSkeleton(
  mesh: THREE.SkinnedMesh,
  matrices: Float32Array,
  worldMatrices: THREE.Matrix4[],
  threeWorldMatrix: THREE.Matrix4,
  localMatrix: THREE.Matrix4,
  parentInverseMatrix: THREE.Matrix4
): void {
  const bones = mesh.skeleton.bones;
  ensureScratchMatrixArrayLength(worldMatrices, bones.length);
  for (let index = 0; index < bones.length; index += 1) {
    writeMmdWorldMatrixToThree(matrices, index, threeWorldMatrix);
    worldMatrices[index].copy(threeWorldMatrix);
  }
  for (let index = 0; index < bones.length; index += 1) {
    const bone = bones[index];
    const parentBoneIndex = findParentBoneIndex(bones, index);
    if (parentBoneIndex >= 0) {
      localMatrix.copy(parentInverseMatrix.copy(worldMatrices[parentBoneIndex]).invert()).multiply(worldMatrices[index]);
    } else {
      localMatrix.copy(worldMatrices[index]);
    }
    localMatrix.decompose(bone.position, bone.quaternion, bone.scale);
    bone.updateMatrix();
  }
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  if (mesh.skeleton.boneTexture) {
    mesh.skeleton.boneTexture.needsUpdate = true;
  }
}

function writeMmdWorldMatrixToThree(
  matrices: Float32Array,
  index: number,
  target: THREE.Matrix4
): THREE.Matrix4 {
  const offset = index * 16;
  return target.set(
    matrices[offset],
    matrices[offset + 4],
    -matrices[offset + 8],
    matrices[offset + 12],
    matrices[offset + 1],
    matrices[offset + 5],
    -matrices[offset + 9],
    matrices[offset + 13],
    -matrices[offset + 2],
    -matrices[offset + 6],
    matrices[offset + 10],
    -matrices[offset + 14],
    0,
    0,
    0,
    1
  );
}

function findParentBoneIndex(bones: readonly THREE.Bone[], index: number): number {
  const parent = bones[index]?.parent;
  if (!parent) {
    return -1;
  }
  for (let candidate = 0; candidate < bones.length; candidate += 1) {
    if (bones[candidate] === parent) {
      return candidate;
    }
  }
  return -1;
}

function syncMorphWeights(mesh: THREE.SkinnedMesh, weights: Float32Array): void {
  const influences = mesh.morphTargetInfluences;
  if (!influences) {
    return;
  }
  for (let index = 0; index < influences.length; index += 1) {
    influences[index] = weights[index] ?? 0;
  }
}

function syncRuntimeObjectForRender(object: THREE.Object3D | undefined): void {
  if (!object) {
    return;
  }
  object.updateMatrixWorld(true);
  updateSkinnedMeshSkeletons(object);
}

function updateSkinnedMeshSkeletons(object: THREE.Object3D): void {
  if (isSkinnedMesh(object)) {
    object.skeleton.update();
  }
  const children = object.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child) {
      updateSkinnedMeshSkeletons(child);
    }
  }
}

function ensureScratchMatrixArrayLength(
  matrices: THREE.Matrix4[],
  length: number
): THREE.Matrix4[] {
  for (let index = matrices.length; index < length; index += 1) {
    matrices.push(new THREE.Matrix4());
  }
  matrices.length = length;
  return matrices;
}

function isObject3D(value: unknown): value is THREE.Object3D {
  return value instanceof THREE.Object3D || hasBooleanFlag(value, "isObject3D");
}

function isSkinnedMesh(value: THREE.Object3D): value is THREE.SkinnedMesh {
  return value instanceof THREE.SkinnedMesh || hasBooleanFlag(value, "isSkinnedMesh");
}

function hasBooleanFlag(value: unknown, key: "isObject3D" | "isSkinnedMesh"): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<typeof key, unknown>)[key] === true
  );
}

function createEmptyDebugStages(): MutableDebugStages {
  return {
    vmdInterpolation: createEmptyDebugStage(),
    appendTransform: createEmptyDebugStage(),
    ik: createEmptyDebugStage(),
    physics: createEmptyDebugStage()
  };
}

function createEmptyDebugStage(): CustomRuntimeDebugStageState {
  return {
    worldMatricesColumnMajor: [],
    morphWeights: []
  };
}

function cloneDebugStage(
  stage: CustomRuntimeDebugStageState
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
    throw new RangeError("CustomRuntime seconds must be finite");
  }
  target.seconds = seconds;
  target.frame = seconds * frameRate;
  target.frameRate = frameRate;
  return target;
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
