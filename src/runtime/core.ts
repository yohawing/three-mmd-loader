import * as THREE from "three";
import type { MmdAnimation } from "../parser/model/modelTypes.js";
import { createBonePhysicsToggleBuffer } from "../physics/legacyPhysicsBridge.js";
import type { MmdPhysicsBackend, MmdPhysicsStepContext } from "../physics/index.js";
import { applyMmdAnimation, isMmdAnimation } from "./animation.js";
import { applyAppendTransforms, reapplyAppendTransformsForSources } from "./append.js";
import { createCcdIkStaticBones, readIkChains, solvePreparedIk } from "./ik-bridge.js";
import { CcdIkSolver } from "./ik/index.js";
import type { CcdIkPreparedChain } from "./ik/index.js";
import { copyNumbersToFloat32Scratch, ensureFloat32ArrayLength, normalizeFrameRate, threeQuaternionToMmd, writeQuaternionToBuffer, writeVector3ToBuffer } from "./math.js";
import { StatefulSpringPhysicsSimulation, applyPhysicsOutputToSkeleton, captureRuntimeDebugStage, cloneDebugStage, createEmptyDebugStage, createEmptyDebugStages, createPhysicsResetContext, createPrePhysicsInputBuffersIfNeeded, extractMmdWorldMatrices, mergePhysicsOutputDeltas, readRuntimeExternalPhysics, readRuntimePhysics } from "./physics.js";
import type { DefaultMmdRuntimeOptions, MmdFrameState, MmdRuntime, MmdRuntimeDebugState, MmdRuntimeEvaluateOptions, MmdRuntimeTickOptions, RuntimeExternalPhysicsData, RuntimeRestTransform } from "./types.js";
export class DefaultMmdRuntime implements MmdRuntime {
  private readonly frameRate: number;
  private readonly ikSolver = new CcdIkSolver();
  private mesh: THREE.SkinnedMesh | undefined;
  private mmdAnimation: MmdAnimation | undefined;
  private restTransforms: RuntimeRestTransform[] = [];
  private preAppendTransforms: RuntimeRestTransform[] = [];
  private physicsSimulation: StatefulSpringPhysicsSimulation | undefined;
  private externalPhysicsData: RuntimeExternalPhysicsData | undefined;
  private bonePhysicsToggles: Record<string, number> = {};
  private debugStages: MmdRuntimeDebugState["stages"] = createEmptyDebugStages();
  private state: MmdFrameState;
  private readonly physicsMode: "none" | "stateful-spring" | "external";
  private readonly physicsBackend: MmdPhysicsBackend | undefined;
  private previousEvaluateSeconds: number | undefined;
  private physicsDisabled = false;
  private preparedIkChains: CcdIkPreparedChain[] = [];
  private readonly scratchAppendTranslations: THREE.Vector3[] = [];
  private readonly scratchAppendRotations: THREE.Quaternion[] = [];
  private readonly scratchReapplyAppendTranslations: THREE.Vector3[] = [];
  private readonly scratchReapplyAppendRotations: THREE.Quaternion[] = [];
  private readonly scratchVector3A = new THREE.Vector3();
  private readonly scratchQuaternionA = new THREE.Quaternion();
  private readonly scratchExternalPhysicsInput = {
    translations: new Float32Array(0),
    rotations: new Float32Array(0),
    worldMatricesColumnMajor: new Float32Array(0)
  };

  constructor(options: DefaultMmdRuntimeOptions = {}) {
    this.frameRate = normalizeFrameRate(options.frameRate ?? 30);
    this.physicsMode = options.physics ?? "none";
    this.physicsBackend = options.physicsBackend;
    this.state = createFrameState(options.initialSeconds ?? 0, this.frameRate);
  }

  evaluate(seconds: number, options: MmdRuntimeEvaluateOptions = {}): MmdFrameState {
    const previousSeconds = this.state.seconds;
    this.state = createFrameState(seconds, this.frameRate);
    if (this.mmdAnimation && this.mesh) {
      this.applyCurrentMmdAnimation(this.state.frame);
      this.captureDebugStage("vmdInterpolation");
    }
    this.applyCurrentAppendTransforms();
    this.captureDebugStage("appendTransform");
    if (options.ik !== false) {
      this.solveIk();
    }
    this.captureDebugStage("ik");
    if (options.physics === false) {
      if (!this.physicsDisabled) {
        this.resetPhysicsState();
      }
      this.physicsDisabled = true;
    } else {
      this.stepStatefulSpringPhysics();
      this.stepExternalPhysics(previousSeconds);
      this.physicsDisabled = false;
    }
    this.mesh?.skeleton.update();
    this.captureDebugStage("physics");
    this.previousEvaluateSeconds = options.physics === false ? undefined : seconds;
    return this.frameState();
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
    const tickOptions = normalizeTickOptions(meshOrOptions, options);
    const { mesh, ...evaluateOptions } = tickOptions;
    const state = this.evaluate(seconds, evaluateOptions);
    syncRuntimeMeshForRender(mesh ?? undefined);
    return state;
  }

  seek(seconds: number): MmdFrameState {
    this.state = createFrameState(seconds, this.frameRate);
    return this.frameState();
  }

  resetPose(): void {
    this.restoreRestTransforms();
    this.preAppendTransforms = [];
  }

  clearAnimation(): void {
    this.mmdAnimation = undefined;
    this.bonePhysicsToggles = {};
  }

  /**
   * @deprecated Prefer seek / resetPose / clearAnimation for finer control.
   */
  reset(seconds = 0): MmdFrameState {
    this.seek(seconds);
    this.resetPose();
    this.clearAnimation();
    this.mesh = undefined;
    this.restTransforms = [];
    this.physicsSimulation?.reset(seconds);
    this.physicsBackend?.reset?.(
      createPhysicsResetContext(createFrameState(seconds, this.frameRate))
    );
    this.externalPhysicsData = undefined;
    this.bonePhysicsToggles = {};
    this.preparedIkChains = [];
    this.debugStages = createEmptyDebugStages();
    this.previousEvaluateSeconds = undefined;
    this.physicsDisabled = false;
    return this.frameState();
  }

  setAnimation(animation: MmdAnimation, mesh: THREE.SkinnedMesh): void {
    if (!mesh.isSkinnedMesh) {
      throw new TypeError("MMD runtime mesh must be a THREE.SkinnedMesh");
    }
    if (!isMmdAnimation(animation)) {
      throw new TypeError("MMD runtime animation must be an MmdAnimation");
    }
    this.prepareAnimationTarget(mesh);
    this.mmdAnimation = animation;
    this.preparedIkChains = this.ikSolver.prepareChains(
      readIkChains(mesh),
      createCcdIkStaticBones(mesh)
    );
    this.applyCurrentMmdAnimation(this.state.frame);
  }

  private prepareAnimationTarget(mesh: THREE.SkinnedMesh): void {
    this.restoreRestTransforms();
    this.mesh = mesh;
    this.restTransforms = mesh.skeleton.bones.map((bone) => ({
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone()
    }));
    this.physicsSimulation =
      this.physicsMode === "stateful-spring"
        ? new StatefulSpringPhysicsSimulation(readRuntimePhysics(mesh))
        : undefined;
    this.physicsSimulation?.reset(0);
    this.externalPhysicsData =
      this.physicsMode === "external" && this.physicsBackend
        ? readRuntimeExternalPhysics(mesh)
        : undefined;
    this.physicsBackend?.reset?.(createPhysicsResetContext(this.state));
    this.previousEvaluateSeconds = undefined;
    this.physicsDisabled = false;
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

  private restoreRestTransforms(): void {
    const mesh = this.mesh;
    if (!mesh) {
      return;
    }
    mesh.skeleton.bones.forEach((bone, index) => {
      const rest = this.restTransforms[index];
      if (!rest) {
        return;
      }
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
    });
  }

  private solveIk(): Set<number> {
    const changedBoneIndices = new Set<number>();
    for (const chain of this.preparedIkChains) {
      const chainSourceBoneIndices = solvePreparedIk(this.mesh, this.ikSolver, [chain]);
      for (const index of chainSourceBoneIndices) {
        changedBoneIndices.add(index);
      }
      this.reapplyCurrentAppendTransformsForSources(chainSourceBoneIndices);
    }
    return changedBoneIndices;
  }


  private applyCurrentMmdAnimation(frame: number): void {
    const result = applyMmdAnimation(this.mesh, this.mmdAnimation, this.restTransforms, frame);
    if (!result) return;
    this.bonePhysicsToggles = result.bonePhysicsToggles;
    this.preAppendTransforms = result.preAppendTransforms;
  }


  private applyCurrentAppendTransforms(): void {
    applyAppendTransforms(this.mesh, this.scratchAppendTranslations, this.scratchAppendRotations, this.scratchVector3A, this.scratchQuaternionA);
  }


  private reapplyCurrentAppendTransformsForSources(sourceBoneIndices: ReadonlySet<number>): void {
    reapplyAppendTransformsForSources(this.mesh, sourceBoneIndices, this.preAppendTransforms, this.scratchReapplyAppendTranslations, this.scratchReapplyAppendRotations, this.scratchVector3A, this.scratchQuaternionA);
  }


  private stepStatefulSpringPhysics(): void {
    const mesh = this.mesh;
    const simulation = this.physicsSimulation;
    if (!mesh || !simulation) {
      return;
    }
    const translations = mesh.skeleton.bones.map(
      (bone) => [bone.position.x, bone.position.y, -bone.position.z] as [number, number, number]
    );
    simulation.step(translations, this.state.seconds, this.bonePhysicsToggles);
    translations.forEach((translation, index) => {
      const bone = mesh.skeleton.bones[index];
      if (bone) {
        bone.position.set(translation[0], translation[1], -translation[2]);
      }
    });
  }

  private stepExternalPhysics(previousSeconds: number): void {
    const mesh = this.mesh;
    const data = this.externalPhysicsData;
    const backend = this.physicsBackend;
    if (!mesh || !data || !backend || backend.disabled || backend.disposed) {
      return;
    }

    mesh.updateWorldMatrix(false, true);
    const inputTranslations = ensureFloat32ArrayLength(
      this.scratchExternalPhysicsInput.translations,
      mesh.skeleton.bones.length * 3
    );
    this.scratchExternalPhysicsInput.translations = inputTranslations;
    inputTranslations.fill(0, 0, mesh.skeleton.bones.length * 3);
    const inputRotations = ensureFloat32ArrayLength(
      this.scratchExternalPhysicsInput.rotations,
      mesh.skeleton.bones.length * 4
    );
    this.scratchExternalPhysicsInput.rotations = inputRotations;
    inputRotations.fill(0, 0, mesh.skeleton.bones.length * 4);
    for (let index = 0; index < mesh.skeleton.bones.length; index += 1) {
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
      extractMmdWorldMatrices(mesh),
      this.scratchExternalPhysicsInput.worldMatricesColumnMajor
    );
    this.scratchExternalPhysicsInput.worldMatricesColumnMajor = inputWorldMatricesColumnMajor;
    const prePhysics = createPrePhysicsInputBuffersIfNeeded(
      data.skeleton,
      inputTranslations,
      inputRotations,
      inputWorldMatricesColumnMajor
    );
    const physicsInputTranslations = prePhysics?.translations ?? inputTranslations;
    const physicsInputRotations = prePhysics?.rotations ?? inputRotations;
    const physicsInputWorldMatricesColumnMajor =
      prePhysics?.worldMatricesColumnMajor ?? inputWorldMatricesColumnMajor;
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
        translations: new Float32Array(physicsInputTranslations),
        rotations: new Float32Array(physicsInputRotations),
        worldMatricesColumnMajor: new Float32Array(physicsInputWorldMatricesColumnMajor),
        updatedBoneIndices: []
      },
      bonePhysicsToggles: createBonePhysicsToggleBuffer(data.bones, this.bonePhysicsToggles),
      morphImpulses: data.morphImpulses
    };

    const result = backend.step(context);
    if (!result.simulated && (context.output?.updatedBoneIndices?.length ?? 0) === 0) {
      return;
    }
    if (prePhysics) {
      mergePhysicsOutputDeltas(context, inputTranslations, inputRotations, prePhysics);
    }
    applyPhysicsOutputToSkeleton(mesh, context);
  }

  private resetPhysicsState(): void {
    this.physicsSimulation?.reset(this.state.seconds);
    this.physicsBackend?.reset?.(createPhysicsResetContext(this.state));
  }

  private captureDebugStage(stage: keyof MmdRuntimeDebugState["stages"]): void {
    const mesh = this.mesh;
    if (!mesh) {
      this.debugStages = {
        ...this.debugStages,
        [stage]: createEmptyDebugStage()
      };
      return;
    }
    this.debugStages = {
      ...this.debugStages,
      [stage]: captureRuntimeDebugStage(mesh)
    };
  }
}


function syncRuntimeMeshForRender(mesh: THREE.Object3D | undefined): void {
  if (!mesh) {
    return;
  }
  // Keep renderer-facing world and bone matrices in sync after runtime evaluation.
  mesh.updateMatrixWorld(true);
  mesh.traverse((object) => {
    if (isSkinnedMesh(object)) {
      object.skeleton.update();
    }
  });
}

function normalizeTickOptions(
  meshOrOptions: THREE.Object3D | MmdRuntimeTickOptions | null | undefined,
  options: MmdRuntimeEvaluateOptions | undefined
): MmdRuntimeTickOptions {
  if (isObject3D(meshOrOptions)) {
    return { ...(options ?? {}), mesh: meshOrOptions };
  }
  if (meshOrOptions == null) {
    return options ?? {};
  }
  return meshOrOptions;
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

function createFrameState(seconds: number, frameRate: number): MmdFrameState {
  if (!Number.isFinite(seconds)) {
    throw new RangeError("MMD runtime seconds must be finite");
  }
  return {
    seconds,
    frame: seconds * frameRate,
    frameRate
  };
}
