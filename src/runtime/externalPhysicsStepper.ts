import * as THREE from "three";
import { writeBonePhysicsToggleBuffer } from "../physics/legacyPhysicsBridge.js";
import type { MmdPhysicsBackend, MmdPhysicsStepContext } from "../physics/index.js";
import {
  copyFloat32ArrayToScratch,
  ensureFloat32ArrayLength,
  resetNumberArray,
  threeQuaternionToMmdInto,
  writeQuaternionToBuffer
} from "./math.js";
import { applyPhysicsOutputToSkeleton, createPrePhysicsInputBuffersIfNeeded, mergePhysicsOutputDeltas } from "./physicsPose.js";
import type { PrePhysicsScratch } from "./physicsPose.js";
import type { MmdFrameState, RuntimeExternalPhysicsData } from "./types.js";
import {
  resetDirectUpdatedBoneIndices,
  acquireDirectStepBuffersIfPossible,
  extractMmdWorldMatricesIntoFloat32
} from "./defaultPhysics.js";

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

export class ExternalPhysicsStepper {
  private externalPhysicsData: RuntimeExternalPhysicsData | undefined;
  private previousEvaluateSeconds: number | undefined;
  private readonly directBuffers: boolean;
  private readonly scratchExternalPhysicsInput = {
    translations: new Float32Array(0),
    rotations: new Float32Array(0),
    worldMatricesColumnMajor: new Float32Array(0),
    outputTranslations: new Float32Array(0),
    outputRotations: new Float32Array(0),
    outputWorldMatricesColumnMajor: new Float32Array(0),
    updatedBoneIndices: [] as number[],
    bonePhysicsToggleBuffer: new Uint8Array(0),
    appliedBones: new Uint8Array(0)
  };
  private readonly rotation: [number, number, number, number] = [0, 0, 0, 1];
  private readonly output: Mutable<NonNullable<MmdPhysicsStepContext["output"]>> = {};
  private readonly context: Mutable<MmdPhysicsStepContext> = {
    seconds: 0, deltaSeconds: 0, frame: 0, frameRate: 0, output: this.output
  };
  private layout = { boneCount: 0, translationValueCount: 0, rotationValueCount: 0, worldMatrixValueCount: 0 };

  private ensureLayout(boneCount: number): void {
    if (this.layout.boneCount !== boneCount) {
      this.layout = {
        boneCount, translationValueCount: boneCount * 3,
        rotationValueCount: boneCount * 4, worldMatrixValueCount: boneCount * 16
      };
      this.scratchExternalPhysicsInput.appliedBones = new Uint8Array(boneCount);
    }
  }

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

  constructor(
    private readonly physicsBackend: MmdPhysicsBackend | undefined,
    options: { directBuffers: boolean }
  ) {
    this.directBuffers = options.directBuffers;
  }

  bind(data: RuntimeExternalPhysicsData | undefined): void {
    this.externalPhysicsData = data;
    this.context.skeleton = undefined;
    this.context.rigidBodies = undefined;
    this.context.joints = undefined;
    this.context.morphImpulses = undefined;
    this.context.inputTranslations = undefined;
    this.context.inputRotations = undefined;
    this.context.inputWorldMatricesColumnMajor = undefined;
    this.context.bonePhysicsToggles = undefined;
    this.output.translations = undefined;
    this.output.rotations = undefined;
    this.output.worldMatricesColumnMajor = undefined;
    this.output.updatedBoneIndices = undefined;
    const count = data?.bones.length ?? 0;
    if (this.scratchExternalPhysicsInput.bonePhysicsToggleBuffer.length < count) {
      this.scratchExternalPhysicsInput.bonePhysicsToggleBuffer = new Uint8Array(count);
    }
  }

  markEvaluated(seconds: number | undefined): void {
    this.previousEvaluateSeconds = seconds;
  }

  step(
    mesh: THREE.SkinnedMesh | undefined,
    state: MmdFrameState,
    previousSeconds: number,
    bonePhysicsToggles: Record<string, number>
  ): boolean {
    const data = this.externalPhysicsData;
    const backend = this.physicsBackend;
    if (!mesh || !data || !backend || backend.disabled || backend.disposed) {
      return false;
    }

    mesh.updateWorldMatrix(false, true);
    const boneCount = mesh.skeleton.bones.length;
    this.ensureLayout(boneCount);
    const directBuffers = this.directBuffers
      ? acquireDirectStepBuffersIfPossible(backend, data, this.layout)
      : undefined;
    let inputTranslations: Float32Array<ArrayBuffer>;
    if (directBuffers) {
      inputTranslations = directBuffers.inputTranslations;
    } else {
      inputTranslations = ensureFloat32ArrayLength(
        this.scratchExternalPhysicsInput.translations,
        boneCount * 3
      );
      this.scratchExternalPhysicsInput.translations = inputTranslations;
    }
    inputTranslations.fill(0, 0, mesh.skeleton.bones.length * 3);
    let inputRotations: Float32Array<ArrayBuffer>;
    if (directBuffers) {
      inputRotations = directBuffers.inputRotations;
    } else {
      inputRotations = ensureFloat32ArrayLength(
        this.scratchExternalPhysicsInput.rotations,
        boneCount * 4
      );
      this.scratchExternalPhysicsInput.rotations = inputRotations;
    }
    inputRotations.fill(0, 0, boneCount * 4);
    for (let index = 0; index < boneCount; index += 1) {
      const bone = mesh.skeleton.bones[index];
      if (!bone) {
        continue;
      }
      const offset = index * 3;
      inputTranslations[offset] = bone.position.x;
      inputTranslations[offset + 1] = bone.position.y;
      inputTranslations[offset + 2] = -bone.position.z;
      writeQuaternionToBuffer(inputRotations, index, threeQuaternionToMmdInto(bone.quaternion, this.rotation));
    }
    let inputWorldMatricesColumnMajor: Float32Array<ArrayBuffer>;
    if (directBuffers) {
      inputWorldMatricesColumnMajor = extractMmdWorldMatricesIntoFloat32(
        mesh,
        directBuffers.inputWorldMatricesColumnMajor
      );
    } else {
      inputWorldMatricesColumnMajor = extractMmdWorldMatricesIntoFloat32(
        mesh, ensureFloat32ArrayLength(this.scratchExternalPhysicsInput.worldMatricesColumnMajor, boneCount * 16)
      );
      this.scratchExternalPhysicsInput.worldMatricesColumnMajor = inputWorldMatricesColumnMajor;
    }
    const prePhysics = createPrePhysicsInputBuffersIfNeeded(
      data.skeleton,
      inputTranslations,
      inputRotations,
      inputWorldMatricesColumnMajor,
      this.scratchPrePhysics
    );
    const physicsInputTranslations = prePhysics?.preTranslations ?? inputTranslations;
    const physicsInputRotations = prePhysics?.preRotations ?? inputRotations;
    const physicsInputWorldMatricesColumnMajor =
      prePhysics?.preWorldMatricesColumnMajor ?? inputWorldMatricesColumnMajor;
    let outputTranslations: Float32Array<ArrayBuffer>;
    if (directBuffers) {
      outputTranslations = directBuffers.outputTranslations;
      outputTranslations.set(physicsInputTranslations);
    } else {
      outputTranslations = copyFloat32ArrayToScratch(
        physicsInputTranslations,
        this.scratchExternalPhysicsInput.outputTranslations
      );
      this.scratchExternalPhysicsInput.outputTranslations = outputTranslations;
    }
    let outputRotations: Float32Array<ArrayBuffer>;
    if (directBuffers) {
      outputRotations = directBuffers.outputRotations;
      outputRotations.set(physicsInputRotations);
    } else {
      outputRotations = copyFloat32ArrayToScratch(
        physicsInputRotations,
        this.scratchExternalPhysicsInput.outputRotations
      );
      this.scratchExternalPhysicsInput.outputRotations = outputRotations;
    }
    let outputWorldMatricesColumnMajor: Float32Array<ArrayBuffer>;
    if (directBuffers) {
      outputWorldMatricesColumnMajor = directBuffers.outputWorldMatricesColumnMajor;
      outputWorldMatricesColumnMajor.set(physicsInputWorldMatricesColumnMajor);
    } else {
      outputWorldMatricesColumnMajor = copyFloat32ArrayToScratch(
        physicsInputWorldMatricesColumnMajor,
        this.scratchExternalPhysicsInput.outputWorldMatricesColumnMajor
      );
      this.scratchExternalPhysicsInput.outputWorldMatricesColumnMajor =
        outputWorldMatricesColumnMajor;
    }
    const bonePhysicsToggleBuffer = writeBonePhysicsToggleBuffer(
      data.bones,
      bonePhysicsToggles,
      directBuffers?.bonePhysicsToggles ?? this.scratchExternalPhysicsInput.bonePhysicsToggleBuffer
    );
    const context = this.context;
    context.seconds = state.seconds;
    context.deltaSeconds = Math.max(0, state.seconds - previousSeconds);
    context.frame = state.frame;
    context.frameRate = state.frameRate;
    context.seeking = this.previousEvaluateSeconds === undefined || state.seconds < this.previousEvaluateSeconds;
    context.skeleton = data.skeleton;
    context.rigidBodies = data.rigidBodies;
    context.joints = data.joints;
    context.inputTranslations = physicsInputTranslations;
    context.inputRotations = physicsInputRotations;
    context.inputWorldMatricesColumnMajor = physicsInputWorldMatricesColumnMajor;
    context.bonePhysicsToggles = bonePhysicsToggleBuffer;
    context.morphImpulses = data.morphImpulses;
    this.output.translations = outputTranslations;
    this.output.rotations = outputRotations;
    this.output.worldMatricesColumnMajor = outputWorldMatricesColumnMajor;
    this.output.updatedBoneIndices = resetDirectUpdatedBoneIndices(directBuffers?.updatedBoneIndices) ??
      resetNumberArray(this.scratchExternalPhysicsInput.updatedBoneIndices);

    const result = backend.step(context);
    const updatedBoneCount = result.updatedBoneCount ?? context.output?.updatedBoneIndices?.length ?? 0;
    if (!result.simulated && updatedBoneCount === 0) {
      return false;
    }
    if (prePhysics) {
      mergePhysicsOutputDeltas(
        context,
        inputTranslations,
        inputRotations,
        prePhysics
      );
    }
    applyPhysicsOutputToSkeleton(mesh, context, this.scratchExternalPhysicsInput.appliedBones, updatedBoneCount);
    return true;
  }
}
