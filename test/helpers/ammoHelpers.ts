import type {
  AmmoNamespace,
  MmdPhysicsJoint,
  MmdPhysicsRigidBody,
  MmdPhysicsStepContext,
  MmdPhysicsVector3Tuple
} from "../../src/physics/index.js";
import { validateConcreteMmdPhysicsStepContext } from "../../src/physics/index.js";
import type { LoaderMmdModelData } from "../../src/three/internalModelData.js";

export async function initAmmo(): Promise<AmmoNamespace> {
  const ammoModule = await import("ammo.js");
  return (ammoModule.default ?? ammoModule) as AmmoNamespace;
}

export function createMinimalStepContext(
  skeleton: LoaderMmdModelData["skeleton"],
  rigidBodies: LoaderMmdModelData["rigidBodies"],
  joints: LoaderMmdModelData["joints"]
): MmdPhysicsStepContext {
  const boneCount = skeleton.bones.length;
  const inputTranslations = new Float32Array(boneCount * 3);
  const inputRotations = new Float32Array(boneCount * 4);
  const inputWorldMatricesColumnMajor = new Float32Array(boneCount * 16);

  skeleton.bones.forEach((bone, index) => {
    const translationOffset = index * 3;
    inputTranslations[translationOffset] = bone.position[0];
    inputTranslations[translationOffset + 1] = bone.position[1];
    inputTranslations[translationOffset + 2] = bone.position[2];

    const rotationOffset = index * 4;
    inputRotations[rotationOffset] = 0;
    inputRotations[rotationOffset + 1] = 0;
    inputRotations[rotationOffset + 2] = 0;
    inputRotations[rotationOffset + 3] = 1;

    writeIdentityMatrix(inputWorldMatricesColumnMajor, index, bone.position);
  });

  const context: MmdPhysicsStepContext = {
    seconds: 1 / 60,
    deltaSeconds: 1 / 60,
    frame: 1,
    frameRate: 60,
    skeleton: {
      bones: skeleton.bones.map((bone, index) => ({
        index,
        name: bone.englishName || bone.name,
        parentIndex: bone.parentIndex,
        restTranslation: [bone.position[0], bone.position[1], bone.position[2]],
        restRotation: [0, 0, 0, 1]
      }))
    },
    rigidBodies: rigidBodies
      .filter((rigidBody) => rigidBody.shape !== "unknown" && rigidBody.mode !== "unknown")
      .map((rigidBody, index): MmdPhysicsRigidBody => ({
        index,
        name: rigidBody.englishName || rigidBody.name,
        boneIndex: rigidBody.boneIndex,
        motionType: rigidBody.mode === "dynamicBone" ? "dynamicWithBone" : rigidBody.mode,
        shape: {
          type: rigidBody.shape,
          size: rigidBody.size
        },
        localTranslation: rigidBody.position,
        localRotation: eulerXyzToQuaternion(rigidBody.rotation),
        mass: rigidBody.mass,
        linearDamping: rigidBody.linearDamping,
        angularDamping: rigidBody.angularDamping,
        restitution: rigidBody.restitution,
        friction: rigidBody.friction,
        collisionGroup: rigidBody.group,
        collisionMask: rigidBody.mask
      })),
    joints: joints.map((joint, index): MmdPhysicsJoint => ({
      index,
      name: joint.englishName || joint.name,
      rigidBodyIndexA: joint.rigidBodyIndexA,
      rigidBodyIndexB: joint.rigidBodyIndexB,
      translation: joint.position,
      rotation: eulerXyzToQuaternion(joint.rotation),
      linearLimit: {
        lower: joint.translationLowerLimit,
        upper: joint.translationUpperLimit
      },
      angularLimit: {
        lower: joint.rotationLowerLimit,
        upper: joint.rotationUpperLimit
      },
      spring: {
        linear: joint.springTranslationFactor,
        angular: joint.springRotationFactor
      }
    })),
    inputTranslations,
    inputRotations,
    inputWorldMatricesColumnMajor,
    output: {
      translations: new Float32Array(inputTranslations),
      rotations: new Float32Array(inputRotations),
      worldMatricesColumnMajor: new Float32Array(inputWorldMatricesColumnMajor),
      updatedBoneIndices: []
    }
  };

  const validation = validateConcreteMmdPhysicsStepContext(context);
  if (!validation.valid) {
    throw new Error(
      `Invalid integration physics step context: ${validation.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`
    );
  }

  return context;
}

function writeIdentityMatrix(
  buffer: Float32Array,
  index: number,
  translation: MmdPhysicsVector3Tuple
): void {
  const offset = index * 16;
  buffer[offset] = 1;
  buffer[offset + 5] = 1;
  buffer[offset + 10] = 1;
  buffer[offset + 12] = translation[0];
  buffer[offset + 13] = translation[1];
  buffer[offset + 14] = translation[2];
  buffer[offset + 15] = 1;
}

function eulerXyzToQuaternion(euler: readonly [number, number, number]): [number, number, number, number] {
  const halfX = euler[0] * 0.5;
  const halfY = euler[1] * 0.5;
  const halfZ = euler[2] * 0.5;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);
  const rotation: [number, number, number, number] = [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  ];
  const length = Math.hypot(...rotation) || 1;
  return [
    rotation[0] / length,
    rotation[1] / length,
    rotation[2] / length,
    rotation[3] / length
  ];
}
