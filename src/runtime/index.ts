import * as THREE from "three";

import type {
  CameraState,
  LightState,
  MmdAnimation,
  VmdBoneFrame,
  VmdCameraFrame,
  VmdInterpolationCurve,
  VmdLightFrame,
  MorphData,
  VmdMorphFrame
} from "../parser/model/modelTypes.js";
import {
  createBonePhysicsToggleBuffer,
  legacyMmdEulerToQuaternion,
  mapLegacyMmdJointToPhysicsJoint,
  mapLegacyMmdRigidBodyToPhysicsRigidBody
} from "../physics/legacyPhysicsBridge.js";
import type { MmdPhysicsBackend, MmdPhysicsStepContext } from "../physics/index.js";
import { CcdIkSolver } from "./ik/index.js";
import type { CcdIkBone, CcdIkPreparedChain } from "./ik/index.js";

export * from "./ik/index.js";

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

export interface MmdRuntime {
  setAnimation(animation: MmdAnimation, mesh: THREE.SkinnedMesh): void;
  evaluate(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState;
  tick(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState;
  tick(
    seconds: number,
    mesh: THREE.Object3D | null | undefined,
    options?: MmdRuntimeEvaluateOptions
  ): MmdFrameState;
  reset(seconds?: number): MmdFrameState;
  frameState(): MmdFrameState;
  debugState(): MmdRuntimeDebugState;
  debugRigidBodyWorldTransformsColumnMajor?(): readonly (readonly number[])[];
}

export interface MmdRuntimeEvaluateOptions {
  readonly physics?: boolean;
  readonly ik?: boolean;
}

export interface DefaultMmdRuntimeOptions {
  readonly frameRate?: number;
  readonly initialSeconds?: number;
  readonly physics?: "none" | "stateful-spring" | "external";
  readonly physicsBackend?: MmdPhysicsBackend;
}

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
      this.applyMmdAnimation(this.state.frame);
      this.captureDebugStage("vmdInterpolation");
    }
    this.applyAppendTransforms();
    this.captureDebugStage("appendTransform");
    if (options.ik !== false) {
      const ikSourceBoneIndices = this.solveIk();
      this.reapplyAppendTransformsForSources(ikSourceBoneIndices);
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

  tick(seconds: number, options?: MmdRuntimeEvaluateOptions): MmdFrameState;
  tick(
    seconds: number,
    mesh: THREE.Object3D | null | undefined,
    options?: MmdRuntimeEvaluateOptions
  ): MmdFrameState;
  tick(
    seconds: number,
    meshOrOptions?: THREE.Object3D | MmdRuntimeEvaluateOptions | null,
    options?: MmdRuntimeEvaluateOptions
  ): MmdFrameState {
    const mesh = isObject3D(meshOrOptions) ? meshOrOptions : undefined;
    const evaluateOptions =
      isObject3D(meshOrOptions) || meshOrOptions == null ? options : meshOrOptions;
    const state = this.evaluate(seconds, evaluateOptions);
    syncRuntimeMeshForRender(mesh);
    return state;
  }

  reset(seconds = 0): MmdFrameState {
    this.restoreRestTransforms();
    this.mesh = undefined;
    this.mmdAnimation = undefined;
    this.restTransforms = [];
    this.preAppendTransforms = [];
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
    this.state = createFrameState(seconds, this.frameRate);
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
    this.applyMmdAnimation(this.state.frame);
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
    const mesh = this.mesh;
    if (!mesh) {
      return new Set();
    }
    const chains = this.preparedIkChains;
    if (chains.length === 0) {
      return new Set();
    }
    mesh.updateWorldMatrix(false, true);
    const bones = mesh.skeleton.bones.map((bone) => ({
      parentIndex:
        bone.parent instanceof THREE.Bone ? mesh.skeleton.bones.indexOf(bone.parent) : -1,
      translation: [bone.position.x, bone.position.y, -bone.position.z] as [number, number, number]
    }));
    const rotations = mesh.skeleton.bones.map((bone) => threeQuaternionToMmd(bone.quaternion));
    this.ikSolver.solvePrepared({
      bones,
      pose: { rotations },
      chains
    });
    rotations.forEach((rotation, index) => {
      mesh.skeleton.bones[index]?.quaternion.fromArray(mmdQuaternionToThree(rotation));
    });
    return collectIkSourceBoneIndices(chains);
  }

  private applyMmdAnimation(frame: number): void {
    const mesh = this.mesh;
    const animation = this.mmdAnimation;
    if (!mesh || !animation) {
      return;
    }

    this.bonePhysicsToggles = {};
    mesh.skeleton.bones.forEach((bone, index) => {
      const rest = this.restTransforms[index];
      if (rest) {
        bone.position.copy(rest.position);
        bone.quaternion.copy(rest.quaternion);
      }
      const track = findBoneTrack(animation, bone);
      const sampled = sampleBoneTrack(track, frame);
      if (!sampled) {
        return;
      }
      if (sampled.physicsToggle !== undefined) {
        this.bonePhysicsToggles[bone.userData.mmdBoneName ?? bone.name] = sampled.physicsToggle;
        if (typeof bone.userData.mmdEnglishBoneName === "string") {
          this.bonePhysicsToggles[bone.userData.mmdEnglishBoneName] = sampled.physicsToggle;
        }
      }
      const restPosition = rest?.position ?? bone.position;
      bone.position.set(
        restPosition.x + sampled.translation[0],
        restPosition.y + sampled.translation[1],
        restPosition.z - sampled.translation[2]
      );
      bone.quaternion.fromArray(mmdQuaternionToThree(sampled.rotation));
    });

    const morphTargetInfluences = mesh.morphTargetInfluences;
    const morphTargetDictionary = mesh.morphTargetDictionary;
    if (morphTargetInfluences && morphTargetDictionary) {
      morphTargetInfluences.fill(0);
      for (const [morphName, morphIndex] of Object.entries(morphTargetDictionary)) {
        const track = animation.morphTracks[morphName];
        if (track) {
          morphTargetInfluences[morphIndex] = sampleMorphTrack(track, frame);
        }
      }
      const runtimeMorphs = readRuntimeMorphs(mesh);
      expandGroupMorphWeights(runtimeMorphs, morphTargetInfluences);
      applyBoneMorphs(mesh, runtimeMorphs, morphTargetInfluences);
    }
    this.preAppendTransforms = mesh.skeleton.bones.map((bone) => ({
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone()
    }));
  }

  private applyAppendTransforms(): void {
    const mesh = this.mesh;
    if (!mesh) {
      return;
    }

    const bones = mesh.skeleton.bones;
    const appendTranslations = prepareVector3ScratchArray(this.scratchAppendTranslations, bones.length);
    const appendRotations = prepareQuaternionScratchArray(this.scratchAppendRotations, bones.length);
    for (const index of appendTransformOrder(bones)) {
      const bone = bones[index];
      if (!bone) {
        continue;
      }
      const appendTransform = bone.userData.mmdAppendTransform as
        | { readonly parentIndex: number; readonly weight: number }
        | undefined;
      const flags = bone.userData.mmdFlags as
        | {
            readonly appendRotate?: boolean;
            readonly appendTranslate?: boolean;
            readonly appendLocal?: boolean;
          }
        | undefined;
      if (!appendTransform || (!flags?.appendRotate && !flags?.appendTranslate)) {
        continue;
      }

      const sourceBone = bones[appendTransform.parentIndex];
      if (!sourceBone) {
        continue;
      }
      const weight = appendTransform.weight;
      const parentHasAppend = sourceBone.userData.mmdAppendTransform !== undefined;

      if (flags.appendRotate) {
        const sourceRotation = sourceBone.quaternion;
        const slerpQ = weightedThreeQuaternion(sourceRotation, weight, this.scratchQuaternionA);
        appendRotations[index].copy(slerpQ);
        bone.quaternion.multiply(slerpQ);
      }
      if (flags.appendTranslate) {
        const weightedTranslation = this.scratchVector3A.copy(
          !flags.appendLocal && parentHasAppend
            ? appendTranslations[appendTransform.parentIndex]
            : sourceBone.position
        );
        weightedTranslation.multiplyScalar(weight);
        appendTranslations[index].copy(weightedTranslation);
        bone.position.add(weightedTranslation);
      }
    }
  }

  private reapplyAppendTransformsForSources(sourceBoneIndices: ReadonlySet<number>): void {
    const mesh = this.mesh;
    if (!mesh || sourceBoneIndices.size === 0 || this.preAppendTransforms.length === 0) {
      return;
    }
    const bones = mesh.skeleton.bones;
    const appendTranslations = prepareVector3ScratchArray(
      this.scratchReapplyAppendTranslations,
      bones.length
    );
    const appendRotations = prepareQuaternionScratchArray(
      this.scratchReapplyAppendRotations,
      bones.length
    );
    const changedBoneIndices = new Set(sourceBoneIndices);
    const reappliedBoneIndices = new Set<number>();
    const order = appendTransformOrder(bones);
    let changed = true;
    while (changed) {
      changed = false;
      for (const index of order) {
        if (reappliedBoneIndices.has(index)) {
          continue;
        }
        const bone = bones[index];
        const appendTransform = bone?.userData.mmdAppendTransform as
          | { readonly parentIndex: number; readonly weight: number }
          | undefined;
        const flags = bone?.userData.mmdFlags as
          | {
              readonly appendRotate?: boolean;
              readonly appendTranslate?: boolean;
              readonly appendLocal?: boolean;
            }
          | undefined;
        if (
          !bone ||
          !appendTransform ||
          !changedBoneIndices.has(appendTransform.parentIndex) ||
          (!flags?.appendRotate && !flags?.appendTranslate)
        ) {
          continue;
        }
        const base = this.preAppendTransforms[index];
        const sourceBone = bones[appendTransform.parentIndex];
        if (!base || !sourceBone) {
          continue;
        }
        bone.position.copy(base.position);
        bone.quaternion.copy(base.quaternion);

        const parentHasAppend = sourceBone.userData.mmdAppendTransform !== undefined;
        if (flags.appendRotate) {
          const sourceRotation =
            !flags.appendLocal && parentHasAppend
              ? appendRotations[appendTransform.parentIndex]
              : sourceBone.quaternion;
          const weightedRotation = weightedThreeQuaternion(
            sourceRotation,
            appendTransform.weight,
            this.scratchQuaternionA
          );
          appendRotations[index].copy(weightedRotation);
          bone.quaternion.multiply(weightedRotation);
        }
        if (flags.appendTranslate) {
          const sourceTranslation = this.scratchVector3A.copy(
            !flags.appendLocal && parentHasAppend
              ? appendTranslations[appendTransform.parentIndex]
              : sourceBone.position
          );
          if (flags.appendLocal || !parentHasAppend) {
            sourceTranslation.sub(
              this.preAppendTransforms[appendTransform.parentIndex]?.position ?? zeroVector3
            );
          }
          const weightedTranslation = sourceTranslation.multiplyScalar(appendTransform.weight);
          appendTranslations[index].copy(weightedTranslation);
          bone.position.add(weightedTranslation);
        }
        reappliedBoneIndices.add(index);
        changedBoneIndices.add(index);
        changed = true;
      }
    }
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

type RuntimeIkChain = Parameters<CcdIkSolver["solve"]>[0]["chains"][number];

interface RuntimeRestTransform {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

interface RuntimePhysicsData {
  readonly bones: readonly RuntimePhysicsBone[];
  readonly rigidBodies: readonly RuntimeRigidBody[];
  readonly joints: readonly RuntimeJoint[];
}

interface RuntimeExternalPhysicsData {
  readonly bones: readonly RuntimeExternalPhysicsBone[];
  readonly skeleton: NonNullable<MmdPhysicsStepContext["skeleton"]>;
  readonly rigidBodies: NonNullable<MmdPhysicsStepContext["rigidBodies"]>;
  readonly joints: NonNullable<MmdPhysicsStepContext["joints"]>;
  readonly morphImpulses: NonNullable<MmdPhysicsStepContext["morphImpulses"]>;
}

interface RuntimePhysicsBone {
  readonly name: string;
  readonly englishName: string;
}

interface RuntimeExternalPhysicsBone {
  readonly name?: string;
  readonly englishName?: string;
}

interface RuntimeRigidBody {
  readonly boneIndex: number;
  readonly mode: string;
  readonly size: readonly number[];
  readonly mass: number;
  readonly linearDamping: number;
}

interface RuntimeJoint {
  readonly rigidBodyIndexA: number;
  readonly rigidBodyIndexB: number;
  readonly translationLowerLimit: readonly number[];
  readonly translationUpperLimit: readonly number[];
  readonly springTranslationFactor: readonly number[];
}

interface RuntimeExternalRigidBody {
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

interface RuntimeExternalJoint {
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

interface RuntimeExternalMorphImpulse {
  readonly morphIndex: number;
  readonly rigidBodyIndex: number;
  readonly local: boolean;
  readonly velocity: readonly [number, number, number];
  readonly torque: readonly [number, number, number];
}

class StatefulSpringPhysicsSimulation {
  private readonly offsets: Float32Array;
  private readonly velocities: Float32Array;
  private previousSeconds: number | undefined;

  constructor(private readonly data: RuntimePhysicsData) {
    this.offsets = new Float32Array(data.rigidBodies.length * 3);
    this.velocities = new Float32Array(data.rigidBodies.length * 3);
  }

  step(
    translations: Array<[number, number, number]>,
    seconds: number,
    bonePhysicsToggles: Record<string, number>
  ): void {
    if (seconds <= 0 || this.data.rigidBodies.length === 0) {
      this.reset(seconds);
      return;
    }
    if (this.previousSeconds === undefined || seconds < this.previousSeconds) {
      this.reset(seconds);
    }
    const dt = clamp(seconds - (this.previousSeconds ?? seconds), 0, 1 / 15);
    this.previousSeconds = seconds;
    if (dt === 0) {
      this.applyOffsets(translations, bonePhysicsToggles);
      return;
    }
    this.integrateDynamicBodies(dt, bonePhysicsToggles);
    this.solveJointSprings(dt, bonePhysicsToggles);
    this.applyOffsets(translations, bonePhysicsToggles);
  }

  reset(seconds = 0): void {
    this.offsets.fill(0);
    this.velocities.fill(0);
    this.previousSeconds = seconds;
  }

  private integrateDynamicBodies(dt: number, bonePhysicsToggles: Record<string, number>): void {
    for (let bodyIndex = 0; bodyIndex < this.data.rigidBodies.length; bodyIndex += 1) {
      const body = this.data.rigidBodies[bodyIndex];
      if (!isDynamicBoneBody(body, this.data.bones.length)) {
        continue;
      }
      if (!isRuntimeRigidBodyPhysicsEnabled(body, this.data.bones, bonePhysicsToggles)) {
        this.resetBodyOffset(bodyIndex);
        continue;
      }
      const base = bodyIndex * 3;
      const mass = Math.max(body.mass, 0.001);
      const damping = clamp(1 - body.linearDamping * dt * 8, 0.02, 0.98);
      const spring = 8 / mass;
      this.velocities[base + 1] -= 9.8 * dt;
      for (let axis = 0; axis < 3; axis += 1) {
        this.velocities[base + axis] -= this.offsets[base + axis] * spring * dt;
        this.velocities[base + axis] *= damping;
        this.offsets[base + axis] += this.velocities[base + axis] * dt;
      }
      const maxOffset =
        Math.max(body.size[0] ?? 0, body.size[1] ?? 0, body.size[2] ?? 0, 0.1) * 0.35;
      clampOffsetVector(this.offsets, this.velocities, base, maxOffset);
    }
  }

  private solveJointSprings(dt: number, bonePhysicsToggles: Record<string, number>): void {
    for (const joint of this.data.joints) {
      const a = joint.rigidBodyIndexA;
      const b = joint.rigidBodyIndexB;
      if (
        a < 0 ||
        b < 0 ||
        a >= this.data.rigidBodies.length ||
        b >= this.data.rigidBodies.length
      ) {
        continue;
      }
      const bodyA = this.data.rigidBodies[a];
      const bodyB = this.data.rigidBodies[b];
      const aDynamic =
        isDynamicBoneBody(bodyA, this.data.bones.length) &&
        isRuntimeRigidBodyPhysicsEnabled(bodyA, this.data.bones, bonePhysicsToggles);
      const bDynamic =
        isDynamicBoneBody(bodyB, this.data.bones.length) &&
        isRuntimeRigidBodyPhysicsEnabled(bodyB, this.data.bones, bonePhysicsToggles);
      if (!aDynamic && !bDynamic) {
        continue;
      }
      const spring = Math.max(
        joint.springTranslationFactor[0] ?? 0,
        joint.springTranslationFactor[1] ?? 0,
        joint.springTranslationFactor[2] ?? 0,
        0.5
      );
      const strength = clamp(spring * dt * 0.2, 0.02, 0.35);
      const aBase = a * 3;
      const bBase = b * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const min = joint.translationLowerLimit[axis] ?? 0;
        const max = joint.translationUpperLimit[axis] ?? 0;
        const delta = this.offsets[bBase + axis] - this.offsets[aBase + axis];
        const limited = clamp(delta, Math.min(min, max), Math.max(min, max));
        const correction = (delta - limited) * strength;
        if (aDynamic) {
          this.offsets[aBase + axis] += correction * 0.5;
        }
        if (bDynamic) {
          this.offsets[bBase + axis] -= correction * 0.5;
        }
      }
    }
  }

  private applyOffsets(
    translations: Array<[number, number, number]>,
    bonePhysicsToggles: Record<string, number>
  ): void {
    for (let bodyIndex = 0; bodyIndex < this.data.rigidBodies.length; bodyIndex += 1) {
      const body = this.data.rigidBodies[bodyIndex];
      if (!isDynamicBoneBody(body, this.data.bones.length)) {
        continue;
      }
      if (!isRuntimeRigidBodyPhysicsEnabled(body, this.data.bones, bonePhysicsToggles)) {
        this.resetBodyOffset(bodyIndex);
        continue;
      }
      const translation = translations[body.boneIndex];
      if (!translation) {
        continue;
      }
      const base = bodyIndex * 3;
      translations[body.boneIndex] = [
        translation[0] + this.offsets[base],
        translation[1] + this.offsets[base + 1],
        translation[2] + this.offsets[base + 2]
      ];
    }
  }

  private resetBodyOffset(bodyIndex: number): void {
    const base = bodyIndex * 3;
    this.offsets[base] = 0;
    this.offsets[base + 1] = 0;
    this.offsets[base + 2] = 0;
    this.velocities[base] = 0;
    this.velocities[base + 1] = 0;
    this.velocities[base + 2] = 0;
  }
}

function readRuntimePhysics(mesh: THREE.SkinnedMesh): RuntimePhysicsData {
  const raw = mesh.userData.mmdPhysics as
    | {
        readonly rigidBodies?: unknown;
        readonly joints?: unknown;
      }
    | undefined;
  return {
    bones: mesh.skeleton.bones.map((bone) => ({
      name: String(bone.userData.mmdBoneName ?? bone.name),
      englishName: String(bone.userData.mmdEnglishBoneName ?? "")
    })),
    rigidBodies: Array.isArray(raw?.rigidBodies) ? raw.rigidBodies.filter(isRuntimeRigidBody) : [],
    joints: Array.isArray(raw?.joints) ? raw.joints.filter(isRuntimeJoint) : []
  };
}

function readRuntimeExternalPhysics(mesh: THREE.SkinnedMesh): RuntimeExternalPhysicsData {
  const raw = mesh.userData.mmdPhysics as
    | {
        readonly rigidBodies?: unknown;
        readonly joints?: unknown;
      }
    | undefined;
  const rawMorphs = mesh.userData.mmdMorphs;
  const bones = mesh.skeleton.bones.map(
    (bone): RuntimeExternalPhysicsBone => ({
      name: typeof bone.userData.mmdBoneName === "string" ? bone.userData.mmdBoneName : bone.name,
      englishName:
        typeof bone.userData.mmdEnglishBoneName === "string"
          ? bone.userData.mmdEnglishBoneName
          : undefined
    })
  );
  const rawRigidBodies = Array.isArray(raw?.rigidBodies)
    ? raw.rigidBodies.filter(isRuntimeExternalRigidBody)
    : [];
  const rigidBodyIndexMap = new Map<number, number>();
  const rigidBodies = rawRigidBodies
    .map((body, originalIndex) => ({ body, originalIndex }))
    .filter(({ body }) => body.shape !== "unknown" && body.mode !== "unknown")
    .map(({ body, originalIndex }, index) => {
      rigidBodyIndexMap.set(originalIndex, index);
      return mapLegacyMmdRigidBodyToPhysicsRigidBody(
        {
          ...body,
          size: [...body.size],
          position: [...body.position],
          rotation: [...body.rotation]
        },
        index
      );
    });
  const joints = Array.isArray(raw?.joints)
    ? raw.joints.filter(isRuntimeExternalJoint).flatMap((joint, index) => {
        const rigidBodyIndexA = rigidBodyIndexMap.get(joint.rigidBodyIndexA);
        const rigidBodyIndexB = rigidBodyIndexMap.get(joint.rigidBodyIndexB);
        if (rigidBodyIndexA === undefined || rigidBodyIndexB === undefined) {
          return [];
        }
        return [
          mapLegacyMmdJointToPhysicsJoint(
            {
              ...joint,
              rigidBodyIndexA,
              rigidBodyIndexB,
              position: [...joint.position],
              rotation: [...joint.rotation],
              translationLowerLimit: [...joint.translationLowerLimit],
              translationUpperLimit: [...joint.translationUpperLimit],
              rotationLowerLimit: [...joint.rotationLowerLimit],
              rotationUpperLimit: [...joint.rotationUpperLimit],
              springTranslationFactor: [...joint.springTranslationFactor],
              springRotationFactor: [...joint.springRotationFactor]
            },
            index
          )
        ];
      })
    : [];
  return {
    bones,
    skeleton: {
      bones: mesh.skeleton.bones.map((bone, index) => ({
        index,
        name: bones[index]?.englishName || bones[index]?.name || bone.name,
        parentIndex:
          bone.parent instanceof THREE.Bone ? mesh.skeleton.bones.indexOf(bone.parent) : -1,
        restTranslation: readMmdRestPosition(bone, mesh, index),
        restRotation: legacyMmdEulerToQuaternion([0, 0, 0]),
        transformAfterPhysics: readMmdTransformAfterPhysicsFlag(bone)
      }))
    },
    rigidBodies,
    joints,
    morphImpulses: Array.isArray(rawMorphs)
      ? rawMorphs.flatMap((morph, morphIndex) =>
          isRuntimeMorph(morph)
            ? (morph.impulseOffsets ?? [])
                .filter(isRuntimeExternalMorphImpulse)
                .flatMap((offset) => {
                  const rigidBodyIndex = rigidBodyIndexMap.get(offset.rigidBodyIndex);
                  return rigidBodyIndex === undefined
                    ? []
                    : [
                        {
                          morphIndex,
                          rigidBodyIndex,
                          weight: 0,
                          local: offset.local,
                          force: [...offset.velocity] as [number, number, number],
                          torque: [...offset.torque] as [number, number, number]
                        }
                      ];
                })
            : []
        )
      : []
  };
}

function isRuntimeRigidBody(value: unknown): value is RuntimeRigidBody {
  const body = value as RuntimeRigidBody;
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger(body.boneIndex) &&
    typeof body.mode === "string" &&
    Array.isArray(body.size) &&
    Number.isFinite(body.mass) &&
    Number.isFinite(body.linearDamping)
  );
}

function isRuntimeJoint(value: unknown): value is RuntimeJoint {
  const joint = value as RuntimeJoint;
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger(joint.rigidBodyIndexA) &&
    Number.isInteger(joint.rigidBodyIndexB) &&
    Array.isArray(joint.translationLowerLimit) &&
    Array.isArray(joint.translationUpperLimit) &&
    Array.isArray(joint.springTranslationFactor)
  );
}

function isRuntimeExternalRigidBody(value: unknown): value is RuntimeExternalRigidBody {
  const body = value as RuntimeExternalRigidBody;
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger(body.boneIndex) &&
    Number.isInteger(body.group) &&
    Number.isInteger(body.mask) &&
    typeof body.shape === "string" &&
    isTuple3(body.size) &&
    isTuple3(body.position) &&
    isTuple3(body.rotation) &&
    Number.isFinite(body.mass) &&
    Number.isFinite(body.linearDamping) &&
    Number.isFinite(body.angularDamping) &&
    Number.isFinite(body.restitution) &&
    Number.isFinite(body.friction) &&
    typeof body.mode === "string"
  );
}

function isRuntimeExternalJoint(value: unknown): value is RuntimeExternalJoint {
  const joint = value as RuntimeExternalJoint;
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger(joint.rigidBodyIndexA) &&
    Number.isInteger(joint.rigidBodyIndexB) &&
    isTuple3(joint.position) &&
    isTuple3(joint.rotation) &&
    isTuple3(joint.translationLowerLimit) &&
    isTuple3(joint.translationUpperLimit) &&
    isTuple3(joint.rotationLowerLimit) &&
    isTuple3(joint.rotationUpperLimit) &&
    isTuple3(joint.springTranslationFactor) &&
    isTuple3(joint.springRotationFactor)
  );
}

function isRuntimeExternalMorphImpulse(value: unknown): value is RuntimeExternalMorphImpulse {
  const offset = value as RuntimeExternalMorphImpulse;
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger(offset.rigidBodyIndex) &&
    typeof offset.local === "boolean" &&
    isTuple3(offset.velocity) &&
    isTuple3(offset.torque)
  );
}

function readMmdRestPosition(
  bone: THREE.Bone,
  mesh: THREE.SkinnedMesh,
  index: number
): [number, number, number] {
  const restPosition = bone.userData.mmdRestPosition;
  if (isTuple3(restPosition)) {
    return [restPosition[0], restPosition[1], restPosition[2]];
  }
  bone.updateWorldMatrix(true, false);
  const worldPosition = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  const meshWorldPosition = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const relative = worldPosition.sub(meshWorldPosition);
  if (Number.isFinite(relative.x) && Number.isFinite(relative.y) && Number.isFinite(relative.z)) {
    return [relative.x, relative.y, -relative.z];
  }
  const local = mesh.skeleton.bones[index]?.position ?? new THREE.Vector3();
  return [local.x, local.y, -local.z];
}

function readMmdTransformAfterPhysicsFlag(bone: THREE.Bone): boolean {
  const flags = bone.userData.mmdFlags;
  return (
    typeof flags === "object" &&
    flags !== null &&
    (flags as { readonly transformAfterPhysics?: unknown }).transformAfterPhysics === true
  );
}

function isTuple3(value: unknown): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => Number.isFinite(component))
  );
}

function isDynamicBoneBody(body: RuntimeRigidBody, boneCount: number): boolean {
  return body.mode === "dynamicBone" && body.boneIndex >= 0 && body.boneIndex < boneCount;
}

function isRuntimeRigidBodyPhysicsEnabled(
  body: RuntimeRigidBody,
  bones: readonly RuntimePhysicsBone[],
  bonePhysicsToggles: Record<string, number>
): boolean {
  const bone = bones[body.boneIndex];
  if (!bone) {
    return true;
  }
  const namedToggle = bonePhysicsToggles[bone.name];
  if (namedToggle !== undefined) {
    return namedToggle !== 0;
  }
  if (bone.englishName) {
    const englishToggle = bonePhysicsToggles[bone.englishName];
    if (englishToggle !== undefined) {
      return englishToggle !== 0;
    }
  }
  return true;
}

function clampOffsetVector(
  offsets: Float32Array,
  velocities: Float32Array,
  base: number,
  maxLength: number
): void {
  const length = Math.hypot(offsets[base], offsets[base + 1], offsets[base + 2]);
  if (length <= maxLength || length <= 1e-6) {
    return;
  }
  const scale = maxLength / length;
  for (let axis = 0; axis < 3; axis += 1) {
    offsets[base + axis] *= scale;
    velocities[base + axis] *= 0.25;
  }
}

function captureRuntimeDebugStage(mesh: THREE.SkinnedMesh): MmdRuntimeDebugStageState {
  mesh.updateWorldMatrix(false, true);
  return {
    worldMatricesColumnMajor: extractMmdWorldMatrices(mesh),
    morphWeights: Array.from(mesh.morphTargetInfluences ?? [])
  };
}

function extractMmdWorldMatrices(mesh: THREE.SkinnedMesh): number[] {
  const signs = [1, 1, -1, 1];
  const matrices: number[] = [];
  for (const bone of mesh.skeleton.bones) {
    const elements = bone.matrixWorld.elements;
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        matrices.push(signs[row] * elements[column * 4 + row] * signs[column]);
      }
    }
  }
  return matrices;
}

function createEmptyDebugStages(): MmdRuntimeDebugState["stages"] {
  return {
    vmdInterpolation: createEmptyDebugStage(),
    appendTransform: createEmptyDebugStage(),
    ik: createEmptyDebugStage(),
    physics: createEmptyDebugStage()
  };
}

function createEmptyDebugStage(): MmdRuntimeDebugStageState {
  return {
    worldMatricesColumnMajor: [],
    morphWeights: []
  };
}

function cloneDebugStage(stage: MmdRuntimeDebugStageState): MmdRuntimeDebugStageState {
  return {
    worldMatricesColumnMajor: Array.from(stage.worldMatricesColumnMajor),
    morphWeights: Array.from(stage.morphWeights)
  };
}

function isMmdAnimation(value: unknown): value is MmdAnimation {
  return (
    typeof value === "object" && value !== null && "boneTracks" in value && "morphTracks" in value
  );
}

function findBoneTrack(animation: MmdAnimation, bone: THREE.Bone): VmdBoneFrame[] | undefined {
  const names = [bone.userData.mmdBoneName, bone.userData.mmdEnglishBoneName, bone.name].filter(
    (name): name is string => typeof name === "string" && name.length > 0
  );
  for (const name of names) {
    const track = animation.boneTracks[name];
    if (track) {
      return track;
    }
  }
  return undefined;
}

function sampleBoneTrack(
  frames: readonly VmdBoneFrame[] | undefined,
  frame: number
): VmdBoneFrame | undefined {
  if (!frames || frames.length === 0) {
    return undefined;
  }
  if (frame < frames[0].frame) {
    return frames[0];
  }
  let previous = frames[0];
  for (let i = 1; i < frames.length; i += 1) {
    const next = frames[i];
    if (frame === next.frame) {
      previous = next;
      continue;
    }
    if (frame < next.frame) {
      const t = (frame - previous.frame) / Math.max(next.frame - previous.frame, 1);
      return {
        frame,
        translation: [
          lerp(
            previous.translation[0],
            next.translation[0],
            interpolateBezier(next.interpolation?.translationX, t)
          ),
          lerp(
            previous.translation[1],
            next.translation[1],
            interpolateBezier(next.interpolation?.translationY, t)
          ),
          lerp(
            previous.translation[2],
            next.translation[2],
            interpolateBezier(next.interpolation?.translationZ, t)
          )
        ],
        rotation: slerp(
          previous.rotation,
          next.rotation,
          interpolateBezier(next.interpolation?.rotation, t)
        ),
        physicsToggle: previous.physicsToggle
      };
    }
    previous = next;
  }
  return previous;
}

function sampleMorphTrack(frames: readonly VmdMorphFrame[], frame: number): number {
  if (frames.length === 0) {
    return 0;
  }
  if (frame < frames[0].frame) {
    return frames[0].weight;
  }
  let previous = frames[0];
  for (let i = 1; i < frames.length; i += 1) {
    const next = frames[i];
    if (frame === next.frame) {
      return next.weight;
    }
    if (frame < next.frame) {
      const t = (frame - previous.frame) / Math.max(next.frame - previous.frame, 1);
      return lerp(previous.weight, next.weight, t);
    }
    previous = next;
  }
  return previous.weight;
}

export function sampleMmdCameraTrack(
  frames: readonly VmdCameraFrame[],
  frame: number
): CameraState | undefined {
  const pair = sampleFramePair(frames, frame);
  if (!pair) {
    return undefined;
  }
  const { previous, next, t } = pair;
  const interpolation = next.interpolation;
  return {
    distance: lerp(previous.distance, next.distance, interpolateBezier(interpolation?.distance, t)),
    position: [
      lerp(previous.position[0], next.position[0], interpolateBezier(interpolation?.positionX, t)),
      lerp(previous.position[1], next.position[1], interpolateBezier(interpolation?.positionY, t)),
      lerp(previous.position[2], next.position[2], interpolateBezier(interpolation?.positionZ, t))
    ],
    rotation: [
      lerp(previous.rotation[0], next.rotation[0], interpolateBezier(interpolation?.rotation, t)),
      lerp(previous.rotation[1], next.rotation[1], interpolateBezier(interpolation?.rotation, t)),
      lerp(previous.rotation[2], next.rotation[2], interpolateBezier(interpolation?.rotation, t))
    ],
    fov: lerp(previous.fov, next.fov, interpolateBezier(interpolation?.fov, t)),
    perspective: t < 1 ? previous.perspective : next.perspective
  };
}

export function sampleMmdLightTrack(
  frames: readonly VmdLightFrame[],
  frame: number
): LightState | undefined {
  const pair = sampleFramePair(frames, frame);
  if (!pair) {
    return undefined;
  }
  const { previous, next, t } = pair;
  return {
    color: [
      lerp(previous.color[0], next.color[0], t),
      lerp(previous.color[1], next.color[1], t),
      lerp(previous.color[2], next.color[2], t)
    ],
    direction: [
      lerp(previous.direction[0], next.direction[0], t),
      lerp(previous.direction[1], next.direction[1], t),
      lerp(previous.direction[2], next.direction[2], t)
    ]
  };
}

function sampleFramePair<T extends { readonly frame: number }>(
  frames: readonly T[],
  frame: number
): { readonly previous: T; readonly next: T; readonly t: number } | undefined {
  if (frames.length === 0) {
    return undefined;
  }
  if (frame < frames[0].frame) {
    return { previous: frames[0], next: frames[0], t: 0 };
  }
  let previous = frames[0];
  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index];
    if (frame === next.frame) {
      previous = next;
      continue;
    }
    if (frame < next.frame) {
      return {
        previous,
        next,
        t: (frame - previous.frame) / Math.max(next.frame - previous.frame, 1)
      };
    }
    previous = next;
  }
  return { previous, next: previous, t: 0 };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function interpolateBezier(curve: VmdInterpolationCurve | undefined, x: number): number {
  if (!curve) {
    return x;
  }
  const [x1, y1, x2, y2] = curve;
  if (Math.abs(x1 - y1) < 1e-6 && Math.abs(x2 - y2) < 1e-6) {
    return x;
  }
  let lower = 0;
  let upper = 1;
  let t = x;
  for (let i = 0; i < 16; i += 1) {
    const sampledX = cubicBezier(t, x1, x2);
    if (Math.abs(sampledX - x) < 1e-5) {
      break;
    }
    if (sampledX < x) {
      lower = t;
    } else {
      upper = t;
    }
    t = (lower + upper) / 2;
  }
  return cubicBezier(t, y1, y2);
}

function cubicBezier(t: number, p1: number, p2: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t;
}

function slerp(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  t: number
): [number, number, number, number] {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    return normalizeQuaternion([
      lerp(a[0], bx, t),
      lerp(a[1], by, t),
      lerp(a[2], bz, t),
      lerp(a[3], bw, t)
    ]);
  }
  const theta0 = Math.acos(cos);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (cos * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return [a[0] * s0 + bx * s1, a[1] * s0 + by * s1, a[2] * s0 + bz * s1, a[3] * s0 + bw * s1];
}

function normalizeQuaternion(
  value: readonly [number, number, number, number]
): [number, number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2], value[3]);
  if (length < 1e-8) {
    return [0, 0, 0, 1];
  }
  return [value[0] / length, value[1] / length, value[2] / length, value[3] / length];
}

function mmdQuaternionToThree(
  rotation: readonly [number, number, number, number]
): [number, number, number, number] {
  return [-rotation[0], -rotation[1], rotation[2], rotation[3]];
}

function threeQuaternionToMmd(quaternion: THREE.Quaternion): [number, number, number, number] {
  return [-quaternion.x, -quaternion.y, quaternion.z, quaternion.w];
}

const zeroVector3 = new THREE.Vector3();

function weightedThreeQuaternion(
  source: THREE.Quaternion,
  weight: number,
  target = new THREE.Quaternion()
): THREE.Quaternion {
  if (weight === 0) {
    return target.identity();
  }
  target.copy(source).normalize();
  let x = target.x;
  let y = target.y;
  let z = target.z;
  const w = target.w;
  if (weight < 0) {
    x = -x;
    y = -y;
    z = -z;
    return slerpIdentityQuaternionInto(x, y, z, w, -weight, target);
  }
  return slerpIdentityQuaternionInto(x, y, z, w, weight, target);
}

function slerpIdentityQuaternionInto(
  x: number,
  y: number,
  z: number,
  w: number,
  weight: number,
  target: THREE.Quaternion
): THREE.Quaternion {
  let bx = x;
  let by = y;
  let bz = z;
  let bw = w;
  let cos = bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    return target.set(bx * weight, by * weight, bz * weight, 1 + (bw - 1) * weight).normalize();
  }
  const theta0 = Math.acos(cos);
  const theta = theta0 * weight;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (cos * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return target.set(bx * s1, by * s1, bz * s1, s0 + bw * s1);
}

function prepareVector3ScratchArray(target: THREE.Vector3[], length: number): THREE.Vector3[] {
  for (let index = target.length; index < length; index += 1) {
    target.push(new THREE.Vector3());
  }
  target.length = length;
  for (const vector of target) {
    vector.set(0, 0, 0);
  }
  return target;
}

function prepareQuaternionScratchArray(
  target: THREE.Quaternion[],
  length: number
): THREE.Quaternion[] {
  for (let index = target.length; index < length; index += 1) {
    target.push(new THREE.Quaternion());
  }
  target.length = length;
  for (const quaternion of target) {
    quaternion.identity();
  }
  return target;
}

function ensureFloat32ArrayLength(
  buffer: Float32Array,
  length: number
): Float32Array<ArrayBuffer> {
  return buffer.length === length ? (buffer as Float32Array<ArrayBuffer>) : new Float32Array(length);
}

function copyNumbersToFloat32Scratch(
  values: readonly number[],
  buffer: Float32Array
): Float32Array<ArrayBuffer> {
  const target = ensureFloat32ArrayLength(buffer, values.length);
  target.set(values);
  return target;
}

function appendTransformOrder(bones: readonly THREE.Bone[]): number[] {
  return bones
    .map((bone, index) => ({
      index,
      layer: readBoneLayer(bone)
    }))
    .sort((left, right) => left.layer - right.layer || left.index - right.index)
    .map((entry) => entry.index);
}

function readBoneLayer(bone: THREE.Bone): number {
  const layer = bone.userData.mmdLayer;
  return Number.isFinite(layer) ? Number(layer) : 0;
}

function readIkChains(mesh: THREE.SkinnedMesh): RuntimeIkChain[] {
  const chains = mesh.userData.mmdIkChains;
  return Array.isArray(chains) ? chains.filter(isRuntimeIkChain) : [];
}

function createCcdIkStaticBones(mesh: THREE.SkinnedMesh): CcdIkBone[] {
  return mesh.skeleton.bones.map((bone) => ({
    parentIndex:
      bone.parent instanceof THREE.Bone ? mesh.skeleton.bones.indexOf(bone.parent) : -1,
    translation: [0, 0, 0] as const
  }));
}

function collectIkSourceBoneIndices(chains: readonly RuntimeIkChain[]): Set<number> {
  const indices = new Set<number>();
  for (const chain of chains) {
    indices.add(chain.goalBoneIndex);
    indices.add(chain.effectorBoneIndex);
    for (const link of chain.links) {
      indices.add(link.boneIndex);
    }
  }
  return indices;
}

function isRuntimeIkChain(value: unknown): value is RuntimeIkChain {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const chain = value as {
    readonly goalBoneIndex?: unknown;
    readonly effectorBoneIndex?: unknown;
    readonly links?: unknown;
    readonly iterationCount?: unknown;
  };
  return (
    Number.isInteger(chain.goalBoneIndex) &&
    Number.isInteger(chain.effectorBoneIndex) &&
    Number.isFinite(chain.iterationCount) &&
    Array.isArray(chain.links)
  );
}

function normalizeFrameRate(frameRate: number): number {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new RangeError("MMD runtime frameRate must be a finite positive number");
  }
  return frameRate;
}

type RuntimeBoneMorphOffset = {
  readonly boneIndex: number;
  readonly translation: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
};

type RuntimeMorph = Pick<MorphData, "type" | "groupOffsets" | "flipOffsets"> & {
  readonly boneOffsets?: readonly RuntimeBoneMorphOffset[];
  readonly impulseOffsets?: readonly RuntimeExternalMorphImpulse[];
};

function readRuntimeMorphs(mesh: THREE.SkinnedMesh): RuntimeMorph[] {
  const morphs = mesh.userData.mmdMorphs;
  return Array.isArray(morphs) ? morphs.filter(isRuntimeMorph) : [];
}

function isRuntimeMorph(value: unknown): value is RuntimeMorph {
  return typeof value === "object" && value !== null && "type" in value && "groupOffsets" in value;
}

function expandGroupMorphWeights(morphs: readonly RuntimeMorph[], weights: number[]): void {
  if (morphs.length === 0) {
    return;
  }
  const directWeights = weights.slice();
  for (let index = 0; index < morphs.length; index += 1) {
    const weight = directWeights[index] ?? 0;
    if (weight === 0) {
      continue;
    }
    expandMorphWeight(morphs, weights, index, weight, new Set([index]));
  }
}

function expandMorphWeight(
  morphs: readonly RuntimeMorph[],
  weights: number[],
  morphIndex: number,
  weight: number,
  path: Set<number>
): void {
  const morph = morphs[morphIndex];
  if ((morph?.type !== "group" && morph?.type !== "flip") || weight === 0) {
    return;
  }
  const offsets = morph.type === "flip" ? (morph.flipOffsets ?? []) : morph.groupOffsets;
  for (const offset of offsets) {
    const targetIndex = offset.morphIndex;
    if (targetIndex < 0 || targetIndex >= weights.length) {
      continue;
    }
    const contribution = weight * offset.weight;
    weights[targetIndex] += contribution;
    if (contribution === 0 || path.has(targetIndex)) {
      continue;
    }
    path.add(targetIndex);
    expandMorphWeight(morphs, weights, targetIndex, contribution, path);
    path.delete(targetIndex);
  }
}

function applyBoneMorphs(
  mesh: THREE.SkinnedMesh,
  morphs: readonly RuntimeMorph[],
  weights: readonly number[]
): void {
  if (morphs.length === 0) {
    return;
  }
  for (let morphIndex = 0; morphIndex < morphs.length; morphIndex += 1) {
    const morph = morphs[morphIndex];
    const weight = weights[morphIndex] ?? 0;
    if (morph?.type !== "bone" || weight === 0) {
      continue;
    }
    for (const offset of morph.boneOffsets ?? []) {
      const bone = mesh.skeleton.bones[offset.boneIndex];
      if (!bone) {
        continue;
      }
      bone.position.x += offset.translation[0] * weight;
      bone.position.y += offset.translation[1] * weight;
      bone.position.z -= offset.translation[2] * weight;
      bone.quaternion.premultiply(
        weightedThreeQuaternion(
          new THREE.Quaternion().fromArray(mmdQuaternionToThree(offset.rotation)),
          weight
        )
      );
    }
  }
}

function createPhysicsResetContext(
  state: MmdFrameState
): NonNullable<Parameters<NonNullable<MmdPhysicsBackend["reset"]>>[0]> {
  return {
    seconds: state.seconds,
    frame: state.frame,
    frameRate: state.frameRate
  };
}

interface PrePhysicsInputBuffers {
  readonly translations: Float32Array;
  readonly rotations: Float32Array;
  readonly worldMatricesColumnMajor: Float32Array;
}

function createPrePhysicsInputBuffersIfNeeded(
  skeleton: NonNullable<MmdPhysicsStepContext["skeleton"]>,
  translations: Float32Array,
  rotations: Float32Array,
  fallbackWorldMatricesColumnMajor: Float32Array
): PrePhysicsInputBuffers | undefined {
  if (!skeleton.bones.some((bone) => bone.transformAfterPhysics === true)) {
    return undefined;
  }
  const preTranslations = new Float32Array(translations);
  const preRotations = new Float32Array(rotations);
  for (const bone of skeleton.bones) {
    if (bone.transformAfterPhysics !== true) {
      continue;
    }
    const restTranslation = bone.restTranslation;
    if (restTranslation) {
      const parentRestTranslation =
        bone.parentIndex === undefined || bone.parentIndex < 0
          ? undefined
          : skeleton.bones[bone.parentIndex]?.restTranslation;
      writeVector3ToBuffer(preTranslations, bone.index, [
        restTranslation[0] - (parentRestTranslation?.[0] ?? 0),
        restTranslation[1] - (parentRestTranslation?.[1] ?? 0),
        restTranslation[2] - (parentRestTranslation?.[2] ?? 0)
      ]);
    }
    writeQuaternionToBuffer(preRotations, bone.index, [0, 0, 0, 1]);
  }
  return {
    translations: preTranslations,
    rotations: preRotations,
    worldMatricesColumnMajor:
      composeMmdWorldMatricesFromLocalBuffers(skeleton, preTranslations, preRotations) ??
      new Float32Array(fallbackWorldMatricesColumnMajor)
  };
}

function composeMmdWorldMatricesFromLocalBuffers(
  skeleton: NonNullable<MmdPhysicsStepContext["skeleton"]>,
  translations: Float32Array,
  rotations: Float32Array
): Float32Array | undefined {
  const boneCount = skeleton.bones.length;
  const worldPositions = Array.from({ length: boneCount }, () => new THREE.Vector3());
  const worldRotations = Array.from({ length: boneCount }, () => new THREE.Quaternion());
  const matrices = new Float32Array(boneCount * 16);
  const matrix = new THREE.Matrix4();
  const unitScale = new THREE.Vector3(1, 1, 1);
  for (const bone of skeleton.bones) {
    const index = bone.index;
    if (index < 0 || index >= boneCount) {
      return undefined;
    }
    const localPosition = readVector3FromBuffer(translations, index);
    const localRotation = readQuaternionFromBuffer(rotations, index);
    const parentIndex = bone.parentIndex ?? -1;
    if (parentIndex >= 0 && parentIndex < boneCount) {
      worldPositions[index].copy(localPosition).applyQuaternion(worldRotations[parentIndex]);
      worldPositions[index].add(worldPositions[parentIndex]);
      worldRotations[index].copy(worldRotations[parentIndex]).multiply(localRotation);
    } else {
      worldPositions[index].copy(localPosition);
      worldRotations[index].copy(localRotation);
    }
    matrix.compose(worldPositions[index], worldRotations[index], unitScale);
    matrices.set(matrix.elements, index * 16);
  }
  return matrices;
}

function mergePhysicsOutputDeltas(
  context: MmdPhysicsStepContext,
  targetTranslations: Float32Array,
  targetRotations: Float32Array,
  prePhysics: PrePhysicsInputBuffers
): void {
  const outputTranslations = context.output?.translations;
  const outputRotations = context.output?.rotations;
  const boneCount = context.skeleton?.bones.length ?? 0;
  if (outputTranslations) {
    for (let index = 0; index < boneCount; index += 1) {
      const base = index * 3;
      outputTranslations[base] =
        targetTranslations[base] + outputTranslations[base] - prePhysics.translations[base];
      outputTranslations[base + 1] =
        targetTranslations[base + 1] +
        outputTranslations[base + 1] -
        prePhysics.translations[base + 1];
      outputTranslations[base + 2] =
        targetTranslations[base + 2] +
        outputTranslations[base + 2] -
        prePhysics.translations[base + 2];
    }
  }
  if (outputRotations) {
    for (let index = 0; index < boneCount; index += 1) {
      const target = readQuaternionFromBuffer(targetRotations, index);
      const pre = readQuaternionFromBuffer(prePhysics.rotations, index).invert();
      const physics = readQuaternionFromBuffer(outputRotations, index);
      physics.multiply(pre).multiply(target).normalize();
      const base = index * 4;
      outputRotations[base] = physics.x;
      outputRotations[base + 1] = physics.y;
      outputRotations[base + 2] = physics.z;
      outputRotations[base + 3] = physics.w;
    }
  }
}

function readVector3FromBuffer(buffer: ArrayLike<number>, index: number): THREE.Vector3 {
  const offset = index * 3;
  return new THREE.Vector3(buffer[offset], buffer[offset + 1], buffer[offset + 2]);
}

function readQuaternionFromBuffer(buffer: ArrayLike<number>, index: number): THREE.Quaternion {
  const offset = index * 4;
  return new THREE.Quaternion(
    buffer[offset],
    buffer[offset + 1],
    buffer[offset + 2],
    buffer[offset + 3]
  ).normalize();
}

function applyPhysicsOutputToSkeleton(
  mesh: THREE.SkinnedMesh,
  context: MmdPhysicsStepContext
): void {
  const translations = context.output?.translations;
  const rotations = context.output?.rotations;
  if (!translations && !rotations) {
    return;
  }
  const updatedIndices =
    context.output?.updatedBoneIndices && context.output.updatedBoneIndices.length > 0
      ? context.output.updatedBoneIndices
      : mesh.skeleton.bones.map((_, index) => index);
  const applied = new Set<number>();
  for (const index of updatedIndices) {
    if (applied.has(index)) {
      continue;
    }
    applied.add(index);
    const bone = mesh.skeleton.bones[index];
    if (!bone) {
      continue;
    }
    if (translations && index * 3 + 2 < translations.length) {
      bone.position.set(
        translations[index * 3],
        translations[index * 3 + 1],
        -translations[index * 3 + 2]
      );
    }
    if (rotations && index * 4 + 3 < rotations.length) {
      bone.quaternion.fromArray(
        mmdQuaternionToThree([
          rotations[index * 4],
          rotations[index * 4 + 1],
          rotations[index * 4 + 2],
          rotations[index * 4 + 3]
        ])
      );
    }
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

function writeVector3ToBuffer(
  buffer: Float32Array,
  index: number,
  value: readonly [number, number, number]
): void {
  const offset = index * 3;
  buffer[offset] = value[0];
  buffer[offset + 1] = value[1];
  buffer[offset + 2] = value[2];
}

function writeQuaternionToBuffer(
  buffer: Float32Array,
  index: number,
  value: readonly [number, number, number, number]
): void {
  const offset = index * 4;
  buffer[offset] = value[0];
  buffer[offset + 1] = value[1];
  buffer[offset + 2] = value[2];
  buffer[offset + 3] = value[3];
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
