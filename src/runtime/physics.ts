import * as THREE from "three";
import { legacyMmdEulerToQuaternion, mapLegacyMmdJointToPhysicsJoint, mapLegacyMmdRigidBodyToPhysicsRigidBody } from "../physics/legacyPhysicsBridge.js";
import type { MmdPhysicsBackend, MmdPhysicsStepContext } from "../physics/index.js";
import { clamp, clampOffsetVector, isTuple3, mmdQuaternionToThree, readMmdRestPosition, writeQuaternionToBuffer, writeVector3ToBuffer } from "./math.js";
import type { MmdFrameState, MmdRuntimeDebugStageState, MmdRuntimeDebugState, RuntimeExternalJoint, RuntimeExternalMorphImpulse, RuntimeExternalPhysicsBone, RuntimeExternalPhysicsData, RuntimeExternalRigidBody, RuntimeJoint, RuntimeMorph, RuntimePhysicsBone, RuntimePhysicsData, RuntimeRigidBody } from "./types.js";
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

function readMmdTransformAfterPhysicsFlag(bone: THREE.Bone): boolean {
  const flags = bone.userData.mmdFlags;
  return (
    typeof flags === "object" &&
    flags !== null &&
    (flags as { readonly transformAfterPhysics?: unknown }).transformAfterPhysics === true
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

function createEmptyDebugStage(): MmdRuntimeDebugStageState {
  return {
    worldMatricesColumnMajor: [],
    morphWeights: []
  };
}

function createEmptyDebugStages(): MmdRuntimeDebugState["stages"] {
  return {
    vmdInterpolation: createEmptyDebugStage(),
    appendTransform: createEmptyDebugStage(),
    ik: createEmptyDebugStage(),
    physics: createEmptyDebugStage()
  };
}

function cloneDebugStage(stage: MmdRuntimeDebugStageState): MmdRuntimeDebugStageState {
  return {
    worldMatricesColumnMajor: Array.from(stage.worldMatricesColumnMajor),
    morphWeights: Array.from(stage.morphWeights)
  };
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

function isRuntimeMorph(value: unknown): value is RuntimeMorph { return typeof value === "object" && value !== null && "type" in value && "groupOffsets" in value; }
export { StatefulSpringPhysicsSimulation, applyPhysicsOutputToSkeleton, captureRuntimeDebugStage, cloneDebugStage, createEmptyDebugStage, createEmptyDebugStages, createPhysicsResetContext, createPrePhysicsInputBuffersIfNeeded, extractMmdWorldMatrices, mergePhysicsOutputDeltas, readRuntimeExternalPhysics, readRuntimePhysics };
