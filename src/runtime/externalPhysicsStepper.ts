import * as THREE from "three";
import { writeBonePhysicsToggleBuffer } from "../physics/legacyPhysicsBridge.js";
import type { MmdPhysicsBackend, MmdPhysicsStepContext } from "../physics/index.js";
import {
  copyFloat32ArrayToScratch,
  copyNumbersToFloat32Scratch,
  ensureFloat32ArrayLength,
  resetNumberArray,
  threeQuaternionToMmd,
  writeQuaternionToBuffer,
  writeVector3ToBuffer
} from "./math.js";
import { extractMmdWorldMatricesInto } from "./debugState.js";
import { applyPhysicsOutputToSkeleton, createPrePhysicsInputBuffersIfNeeded, mergePhysicsOutputDeltas } from "./physicsPose.js";
import type { PrePhysicsScratch } from "./physicsPose.js";
import type { MmdFrameState, RuntimeExternalPhysicsData } from "./types.js";
import {
  resetDirectUpdatedBoneIndices,
  acquireDirectStepBuffersIfPossible,
  extractMmdWorldMatricesIntoFloat32
} from "./defaultPhysics.js";

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

  constructor(
    private readonly physicsBackend: MmdPhysicsBackend | undefined,
    options: { directBuffers: boolean }
  ) {
    this.directBuffers = options.directBuffers;
  }

  bind(data: RuntimeExternalPhysicsData | undefined): void {
    this.externalPhysicsData = data;
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
    const directBuffers = this.directBuffers
      ? acquireDirectStepBuffersIfPossible(backend, data, boneCount)
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
      writeVector3ToBuffer(inputTranslations, index, [
        bone.position.x,
        bone.position.y,
        -bone.position.z
      ]);
      writeQuaternionToBuffer(inputRotations, index, threeQuaternionToMmd(bone.quaternion));
    }
    let inputWorldMatricesColumnMajor: Float32Array<ArrayBuffer>;
    if (directBuffers) {
      inputWorldMatricesColumnMajor = extractMmdWorldMatricesIntoFloat32(
        mesh,
        directBuffers.inputWorldMatricesColumnMajor
      );
    } else {
      inputWorldMatricesColumnMajor = copyNumbersToFloat32Scratch(
        extractMmdWorldMatricesInto(
          mesh,
          this.scratchExternalPhysicsInput.worldMatricesColumnMajorNumbers
        ),
        this.scratchExternalPhysicsInput.worldMatricesColumnMajor
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
    const physicsInputTranslations = prePhysics?.translations ?? inputTranslations;
    const physicsInputRotations = prePhysics?.rotations ?? inputRotations;
    const physicsInputWorldMatricesColumnMajor =
      prePhysics?.worldMatricesColumnMajor ?? inputWorldMatricesColumnMajor;
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
    if (
      !directBuffers &&
      this.scratchExternalPhysicsInput.bonePhysicsToggleBuffer.length < data.bones.length
    ) {
      this.scratchExternalPhysicsInput.bonePhysicsToggleBuffer = new Uint8Array(data.bones.length);
    }
    const bonePhysicsToggleBuffer = writeBonePhysicsToggleBuffer(
      data.bones,
      bonePhysicsToggles,
      directBuffers?.bonePhysicsToggles ?? this.scratchExternalPhysicsInput.bonePhysicsToggleBuffer
    );
    const context: MmdPhysicsStepContext = {
      seconds: state.seconds,
      deltaSeconds: Math.max(0, state.seconds - previousSeconds),
      frame: state.frame,
      frameRate: state.frameRate,
      seeking:
        this.previousEvaluateSeconds === undefined ||
        state.seconds < this.previousEvaluateSeconds,
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
        updatedBoneIndices:
          resetDirectUpdatedBoneIndices(directBuffers?.updatedBoneIndices) ??
          resetNumberArray(this.scratchExternalPhysicsInput.updatedBoneIndices)
      },
      bonePhysicsToggles: bonePhysicsToggleBuffer,
      morphImpulses: data.morphImpulses
    };

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
        prePhysics,
        this.scratchPrePhysics
      );
    }
    applyPhysicsOutputToSkeleton(mesh, context, updatedBoneCount);
    return true;
  }
}
