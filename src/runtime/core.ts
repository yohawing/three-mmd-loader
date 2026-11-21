import * as THREE from "three";
import { validateMorphOverrides } from "./morphOverrides.js";
import type { CameraState, LightState, MmdAnimation } from "../parser/model/modelTypes.js";
import type { MmdPhysicsBackend } from "../physics/index.js";
import {
  applyMmdAnimation,
  isMmdAnimation,
  preparePreAppendTransforms
} from "./animation.js";
import { sampleMmdCameraTrackInto, sampleMmdLightTrackInto } from "./sceneTrackSampling.js";
import {
  appendTransformOrder,
  applyAppendTransforms,
  reapplyAppendTransformsForSources
} from "./append.js";
import { createCcdIkStaticBones, readIkChains, solvePreparedIk } from "./ik-bridge.js";
import type { SolvePreparedIkScratch } from "./ik-bridge.js";
import { CcdIkSolver } from "./ik/index.js";
import type { CcdIkPreparedChain } from "./ik/index.js";
import {
  normalizeFrameRate,
  prepareQuaternionScratchArray,
  prepareVector3ScratchArray
} from "./math.js";
import { syncMorphSplitTargetInfluences } from "./morphSplitSync.js";
import { StatefulSpringPhysicsSimulation, readRuntimeExternalPhysics, readRuntimePhysics } from "./physics.js";
import { captureRuntimeDebugStageInto, cloneDebugStage, createEmptyDebugStages } from "./debugState.js";
import { createPhysicsResetContext } from "./physicsPose.js";
import { ExternalPhysicsStepper } from "./externalPhysicsStepper.js";
import type { DefaultMmdRuntimeOptions, MmdFrameState, MmdRuntime, MmdRuntimeDebugState, MmdRuntimeEvaluateOptions, MmdRuntimeTickOptions, RuntimeRestTransform } from "./types.js";
import { readMmdBoneUserData, readMmdMeshRuntimeData } from "./userData.js";
import { ensureTuple3ScratchLength } from "./defaultPhysics.js";
import { copyFrameStateInto, createFrameState, writeFrameState } from "./frameState.js";
import type { MutableFrameState } from "./frameState.js";
import { isObject3D, syncRuntimeMeshForRender } from "./renderSync.js";

type MutableDebugStages = {
  -readonly [K in keyof MmdRuntimeDebugState["stages"]]: MmdRuntimeDebugState["stages"][K];
};

export class DefaultMmdRuntime implements MmdRuntime {
  private readonly frameRate: number;
  private readonly ikSolver = new CcdIkSolver();
  private mesh: THREE.SkinnedMesh | undefined;
  private mmdAnimation: MmdAnimation | undefined;
  private restTransforms: RuntimeRestTransform[] = [];
  private preAppendTransforms: RuntimeRestTransform[] = [];
  private physicsSimulation: StatefulSpringPhysicsSimulation | undefined;
  private readonly externalPhysicsStepper: ExternalPhysicsStepper;
  private bonePhysicsToggles: Record<string, number> = {};
  private debugStages: MutableDebugStages = createEmptyDebugStages();
  private readonly state: MutableFrameState;
  private readonly evaluateReturnState: MutableFrameState = {
    seconds: 0,
    frame: 0,
    frameRate: 30
  };
  private readonly physicsMode: "none" | "stateful-spring" | "external";
  private readonly physicsBackend: MmdPhysicsBackend | undefined;
  private physicsDisabled = false;
  private preparedIkChains: CcdIkPreparedChain[] = [];
  private readonly activeIkChains: CcdIkPreparedChain[] = [];
  private currentIkPropertyFrame: MmdAnimation["propertyFrames"][number] | undefined;
  private currentIkPropertyFrameIndex = -1;
  private readonly disabledIkBoneNames = new Set<string>();
  private readonly scratchAppendTranslations: THREE.Vector3[] = [];
  private readonly scratchAppendRotations: THREE.Quaternion[] = [];
  private cachedAppendTransformOrder: number[] = [];
  private readonly scratchReapplyChangedAppendBoneIndices = new Set<number>();
  private readonly scratchReappliedAppendBoneIndices = new Set<number>();
  private readonly scratchReapplyAppendTranslations: THREE.Vector3[] = [];
  private readonly scratchReapplyAppendRotations: THREE.Quaternion[] = [];
  private readonly scratchVector3A = new THREE.Vector3();
  private readonly scratchQuaternionA = new THREE.Quaternion();
  private readonly scratchAnimation = {
    boneMorphQuaternion: new THREE.Quaternion(),
    boneSample: {
      frame: 0,
      translationX: 0,
      translationY: 0,
      translationZ: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      rotationW: 1,
      hasPhysicsToggle: false,
      physicsToggle: -1
    },
    bonePhysicsToggles: {} as Record<string, number>,
    groupMorphDirectWeights: [] as number[],
    groupMorphVisited: new Uint8Array(0)
  };
  private readonly scratchIk: SolvePreparedIkScratch = {
    bones: [],
    rotations: [],
    sourceBoneIndices: new Set<number>()
  };
  private readonly scratchSingleIkChain: CcdIkPreparedChain[] = [];
  private readonly scratchChangedIkBoneIndices = new Set<number>();
  private readonly scratchCameraState: CameraState = {
    distance: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    fov: 1,
    perspective: true
  };
  private readonly scratchCameraFrameHint = { index: 0 };
  private readonly scratchLightState: LightState = {
    color: [0, 0, 0],
    direction: [0, 0, 0]
  };
  private readonly scratchStatefulSpringTranslations: Array<[number, number, number]> = [];

  constructor(options: DefaultMmdRuntimeOptions = {}) {
    this.frameRate = normalizeFrameRate(options.frameRate ?? 30);
    this.physicsMode = options.physics ?? "none";
    this.physicsBackend = options.physicsBackend;
    this.externalPhysicsStepper = new ExternalPhysicsStepper(this.physicsBackend, { directBuffers: true });
    this.state = createFrameState(options.initialSeconds ?? 0, this.frameRate);
  }

  evaluate(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState {
    if (options?.morphOverrides) {
      const morphs = this.mesh ? readMmdMeshRuntimeData(this.mesh).mmdMorphs : undefined;
      validateMorphOverrides(options.morphOverrides,
        Array.isArray(morphs) ? morphs.length : this.mesh?.morphTargetInfluences?.length ?? 0);
    }
    const previousSeconds = this.state.seconds;
    writeFrameState(this.state, seconds, this.frameRate);
    if (this.mesh && (this.mmdAnimation || options?.morphOverrides || this.hadMorphOverrides)) {
      this.applyCurrentMmdAnimation(this.state.frame, options?.morphOverrides);
      this.updateCurrentIkStates(this.state.frame);
      this.captureDebugStage("vmdInterpolation");
    }
    this.hadMorphOverrides = (options?.morphOverrides?.indices.length ?? 0) > 0;
    this.applyCurrentAppendTransforms();
    this.captureDebugStage("appendTransform");
    if (options?.ik !== false) {
      this.solveIk();
    }
    this.captureDebugStage("ik");
    if (options?.physics === false) {
      if (!this.physicsDisabled) {
        this.resetPhysicsState();
      }
      this.physicsDisabled = true;
    } else {
      this.stepStatefulSpringPhysics();
      this.externalPhysicsStepper.step(this.mesh, this.state, previousSeconds, this.bonePhysicsToggles);
      this.physicsDisabled = false;
    }
    this.mesh?.skeleton.update();
    this.captureDebugStage("physics");
    this.externalPhysicsStepper.markEvaluated(options?.physics === false ? undefined : seconds);
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
    let mesh: THREE.Object3D | null | undefined;
    let evaluateOptions: MmdRuntimeEvaluateOptions | undefined;
    if (isObject3D(meshOrOptions)) {
      mesh = meshOrOptions;
      evaluateOptions = options;
    } else if (meshOrOptions == null) {
      mesh = undefined;
      evaluateOptions = options;
    } else {
      mesh = meshOrOptions.mesh;
      evaluateOptions = meshOrOptions;
    }
    const state = this.evaluate(seconds, evaluateOptions);
    syncRuntimeMeshForRender(mesh ?? undefined);
    return state;
  }

  seek(seconds: number): MmdFrameState {
    writeFrameState(this.state, seconds, this.frameRate);
    return copyFrameStateInto(this.evaluateReturnState, this.state);
  }

  resetPose(): void {
    this.restoreRestTransforms();
    this.syncPreAppendTransformsToCurrentPose();
  }

  clearAnimation(): void {
    this.mmdAnimation = undefined;
    this.bonePhysicsToggles = {};
    this.activeIkChains.length = 0;
    this.currentIkPropertyFrame = undefined;
    this.currentIkPropertyFrameIndex = -1;
    this.disabledIkBoneNames.clear();
    this.scratchCameraFrameHint.index = 0;
  }

  cameraState(): CameraState | undefined {
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

  lightState(): LightState | undefined {
    const frames = this.mmdAnimation?.lightFrames;
    if (!frames || frames.length === 0) {
      return undefined;
    }
    return sampleMmdLightTrackInto(frames, this.state.frame, this.scratchLightState);
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
    this.preAppendTransforms.length = 0;
    this.cachedAppendTransformOrder.length = 0;
    this.physicsSimulation?.reset(seconds);
    this.physicsBackend?.reset?.(
      createPhysicsResetContext(createFrameState(seconds, this.frameRate))
    );
    this.externalPhysicsStepper.bind(undefined);
    this.bonePhysicsToggles = {};
    this.preparedIkChains = [];
    this.activeIkChains.length = 0;
    this.currentIkPropertyFrame = undefined;
    this.currentIkPropertyFrameIndex = -1;
    this.disabledIkBoneNames.clear();
    this.scratchCameraFrameHint.index = 0;
    this.debugStages = createEmptyDebugStages();
    this.externalPhysicsStepper.markEvaluated(undefined);
    this.physicsDisabled = false;
    return copyFrameStateInto(this.evaluateReturnState, this.state);
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
    this.activeIkChains.length = 0;
    this.currentIkPropertyFrame = undefined;
    this.currentIkPropertyFrameIndex = -1;
    this.disabledIkBoneNames.clear();
    this.applyCurrentMmdAnimation(this.state.frame);
    this.updateCurrentIkStates(this.state.frame);
  }

  private prepareAnimationTarget(mesh: THREE.SkinnedMesh): void {
    this.restoreRestTransforms();
    this.mesh = mesh;
    const boneCount = mesh.skeleton.bones.length;
    this.cachedAppendTransformOrder = appendTransformOrder(mesh.skeleton.bones);
    prepareVector3ScratchArray(this.scratchAppendTranslations, boneCount);
    prepareQuaternionScratchArray(this.scratchAppendRotations, boneCount);
    prepareVector3ScratchArray(this.scratchReapplyAppendTranslations, boneCount);
    prepareQuaternionScratchArray(this.scratchReapplyAppendRotations, boneCount);
    preparePreAppendTransforms(mesh.skeleton.bones, this.preAppendTransforms);
    this.restTransforms = mesh.skeleton.bones.map((bone) => ({
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone()
    }));
    this.physicsSimulation =
      this.physicsMode === "stateful-spring"
        ? new StatefulSpringPhysicsSimulation(readRuntimePhysics(mesh))
        : undefined;
    this.physicsSimulation?.reset(0);
    this.externalPhysicsStepper.bind(
      this.physicsMode === "external" && this.physicsBackend
        ? readRuntimeExternalPhysics(mesh)
        : undefined
    );
    this.physicsBackend?.reset?.(createPhysicsResetContext(this.state));
    this.externalPhysicsStepper.markEvaluated(undefined);
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

  private syncPreAppendTransformsToCurrentPose(): void {
    const mesh = this.mesh;
    if (!mesh || this.preAppendTransforms.length === 0) {
      return;
    }
    const bones = mesh.skeleton.bones;
    for (let index = 0; index < bones.length; index += 1) {
      const bone = bones[index];
      const transform = this.preAppendTransforms[index];
      if (!bone || !transform) {
        continue;
      }
      transform.position.copy(bone.position);
      transform.quaternion.copy(bone.quaternion);
    }
  }

  private solveIk(): Set<number> {
    const chains = this.currentEnabledIkChains();
    if (!this.hasHandTwistIkChain()) {
      const sourceBoneIndices = solvePreparedIk(this.mesh, this.ikSolver, chains, this.scratchIk);
      this.reapplyCurrentAppendTransformsForSources(sourceBoneIndices);
      return sourceBoneIndices;
    }
    const changedBoneIndices = this.scratchChangedIkBoneIndices;
    changedBoneIndices.clear();
    for (const chain of chains) {
      this.scratchSingleIkChain[0] = chain;
      this.scratchSingleIkChain.length = 1;
      const chainSourceBoneIndices = solvePreparedIk(
        this.mesh,
        this.ikSolver,
        this.scratchSingleIkChain,
        this.scratchIk
      );
      for (const index of chainSourceBoneIndices) {
        changedBoneIndices.add(index);
      }
      this.reapplyCurrentAppendTransformsForSources(chainSourceBoneIndices);
    }
    this.scratchSingleIkChain.length = 0;
    return changedBoneIndices;
  }

  private currentEnabledIkChains(): readonly CcdIkPreparedChain[] {
    if (this.disabledIkBoneNames.size === 0) {
      return this.preparedIkChains;
    }
    return this.activeIkChains;
  }

  private rebuildActiveIkChains(): void {
    this.activeIkChains.length = 0;
    const bones = this.mesh?.skeleton.bones;
    if (!bones) {
      return;
    }
    for (const chain of this.preparedIkChains) {
      if (this.isIkChainEnabled(chain, bones)) {
        this.activeIkChains.push(chain);
      }
    }
  }

  private isIkChainEnabled(
    chain: CcdIkPreparedChain,
    bones: readonly THREE.Bone[]
  ): boolean {
    const bone = bones[chain.goalBoneIndex];
    if (!bone) {
      return true;
    }
    if (this.disabledIkBoneNames.has(bone.name)) {
      return false;
    }
    const userData = readMmdBoneUserData(bone);
    const mmdName = userData.mmdBoneName;
    if (typeof mmdName === "string" && this.disabledIkBoneNames.has(mmdName)) {
      return false;
    }
    const ikStateName = userData.mmdIkStateName;
    if (typeof ikStateName === "string" && this.disabledIkBoneNames.has(ikStateName)) {
      return false;
    }
    const englishName = userData.mmdEnglishBoneName;
    return !(typeof englishName === "string" && this.disabledIkBoneNames.has(englishName));
  }

  private hasHandTwistIkChain(): boolean {
    const bones = this.mesh?.skeleton.bones;
    if (!bones) {
      return false;
    }
    for (const chain of this.preparedIkChains) {
      const bone = bones[chain.goalBoneIndex];
      const userData = bone ? readMmdBoneUserData(bone) : undefined;
      if (
        bone?.name.includes("手捩IK") === true ||
        (typeof userData?.mmdEnglishName === "string" &&
          userData.mmdEnglishName.includes("lwr-arm-twistIK"))
      ) {
        return true;
      }
    }
    return false;
  }


  private hadMorphOverrides = false;

  private applyCurrentMmdAnimation(frame: number, overrides?: MmdRuntimeEvaluateOptions["morphOverrides"]): void {
    const mesh = this.mesh;
    if (!mesh) {
      return;
    }
    const bonePhysicsToggles = applyMmdAnimation(
      mesh,
      this.mmdAnimation,
      this.restTransforms,
      this.preAppendTransforms,
      this.scratchAnimation,
      frame,
      overrides
    );
    if (!bonePhysicsToggles) return;
    syncMorphSplitTargetInfluences(mesh);
    this.bonePhysicsToggles = bonePhysicsToggles;
  }

  private updateCurrentIkStates(frame: number): void {
    const propertyFrame = this.sampleCurrentPropertyFrame(frame);
    if (propertyFrame === this.currentIkPropertyFrame) {
      return;
    }
    this.currentIkPropertyFrame = propertyFrame;
    this.disabledIkBoneNames.clear();
    this.activeIkChains.length = 0;
    if (!propertyFrame) {
      return;
    }
    for (const state of propertyFrame.ikStates) {
      if (!state.enabled) {
        this.disabledIkBoneNames.add(state.boneName);
      }
    }
    if (this.disabledIkBoneNames.size > 0) {
      this.rebuildActiveIkChains();
    }
  }

  private sampleCurrentPropertyFrame(frame: number): MmdAnimation["propertyFrames"][number] | undefined {
    const frames = this.mmdAnimation?.propertyFrames;
    if (!frames || frames.length === 0 || frame < (frames[0]?.frame ?? Number.POSITIVE_INFINITY)) {
      this.currentIkPropertyFrameIndex = -1;
      return undefined;
    }
    let index = this.currentIkPropertyFrameIndex;
    const current = index >= 0 && index < frames.length ? frames[index] : undefined;
    if (!current || current.frame > frame) {
      index = findPropertyFrameIndex(frames, frame);
    } else {
      while (index + 1 < frames.length && (frames[index + 1]?.frame ?? Number.POSITIVE_INFINITY) <= frame) {
        index += 1;
      }
    }
    this.currentIkPropertyFrameIndex = index;
    return frames[index];
  }


  private applyCurrentAppendTransforms(): void {
    applyAppendTransforms(
      this.mesh,
      this.cachedAppendTransformOrder,
      this.scratchAppendTranslations,
      this.scratchAppendRotations,
      this.scratchVector3A,
      this.scratchQuaternionA
    );
  }


  private reapplyCurrentAppendTransformsForSources(sourceBoneIndices: ReadonlySet<number>): void {
    reapplyAppendTransformsForSources(
      this.mesh,
      sourceBoneIndices,
      this.cachedAppendTransformOrder,
      this.preAppendTransforms,
      this.scratchReapplyChangedAppendBoneIndices,
      this.scratchReappliedAppendBoneIndices,
      this.scratchReapplyAppendTranslations,
      this.scratchReapplyAppendRotations,
      this.scratchVector3A,
      this.scratchQuaternionA
    );
  }


  private stepStatefulSpringPhysics(): void {
    const mesh = this.mesh;
    const simulation = this.physicsSimulation;
    if (!mesh || !simulation) {
      return;
    }
    const translations = ensureTuple3ScratchLength(
      this.scratchStatefulSpringTranslations,
      mesh.skeleton.bones.length
    );
    for (let index = 0; index < mesh.skeleton.bones.length; index += 1) {
      const bone = mesh.skeleton.bones[index];
      const translation = translations[index];
      translation[0] = bone.position.x;
      translation[1] = bone.position.y;
      translation[2] = -bone.position.z;
    }
    simulation.step(translations, this.state.seconds, this.bonePhysicsToggles);
    for (let index = 0; index < translations.length; index += 1) {
      const translation = translations[index];
      const bone = mesh.skeleton.bones[index];
      if (bone) {
        bone.position.set(translation[0], translation[1], -translation[2]);
      }
    }
  }

  private resetPhysicsState(): void {
    this.physicsSimulation?.reset(this.state.seconds);
    this.physicsBackend?.reset?.(createPhysicsResetContext(this.state));
  }

  private captureDebugStage(stage: keyof MmdRuntimeDebugState["stages"]): void {
    const mesh = this.mesh;
    if (!mesh) {
      clearDebugStage(this.debugStages[stage]);
      return;
    }
    captureRuntimeDebugStageInto(mesh, this.debugStages[stage]);
  }
}

function findPropertyFrameIndex(
  frames: readonly MmdAnimation["propertyFrames"][number][],
  frame: number
): number {
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const middleFrame = frames[middle]?.frame ?? Number.POSITIVE_INFINITY;
    if (middleFrame <= frame) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, high);
}

function clearDebugStage(stage: MmdRuntimeDebugState["stages"]["physics"]): void {
  (stage.worldMatricesColumnMajor as number[]).length = 0;
  (stage.morphWeights as number[]).length = 0;
}
