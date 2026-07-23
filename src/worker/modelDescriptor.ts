import * as THREE from "three";

const boneUserDataKeys = [
  "mmdBoneName",
  "mmdEnglishBoneName",
  "mmdEnglishName",
  "mmdIkStateName",
  "mmdRestPosition",
  "mmdAppendTransform",
  "mmdFlags",
  "mmdLayer"
] as const;

const meshUserDataKeys = ["mmdIkChains", "mmdMorphs", "mmdPhysics"] as const;

export interface MmdRuntimeBoneDescriptor {
  readonly name: string;
  readonly parentIndex: number;
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
  readonly userData: Readonly<Record<string, unknown>>;
}

export interface MmdRuntimeModelDescriptor {
  readonly version: 1;
  readonly name: string;
  readonly bones: readonly MmdRuntimeBoneDescriptor[];
  readonly boneInversesColumnMajor: readonly (readonly number[])[];
  readonly bindMatrixColumnMajor: readonly number[];
  readonly morphCount: number;
  readonly morphTargetDictionary?: Readonly<Record<string, number>>;
  readonly userData: Readonly<Record<string, unknown>>;
}

/** Captures the runtime-only subset of an MMD mesh into structured-clone-safe data. */
export function serializeMmdRuntimeModelDescriptor(
  mesh: THREE.SkinnedMesh
): MmdRuntimeModelDescriptor {
  if (!mesh.isSkinnedMesh) {
    throw new TypeError("MMD runtime worker descriptor source must be a THREE.SkinnedMesh");
  }
  const bones = mesh.skeleton.bones;
  return {
    version: 1,
    name: mesh.name,
    bones: bones.map((bone) => ({
      name: bone.name,
      parentIndex: bone.parent ? bones.indexOf(bone.parent as THREE.Bone) : -1,
      position: [bone.position.x, bone.position.y, bone.position.z],
      quaternion: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
      scale: [bone.scale.x, bone.scale.y, bone.scale.z],
      userData: cloneSelectedUserData(bone.userData, boneUserDataKeys)
    })),
    boneInversesColumnMajor: mesh.skeleton.boneInverses.map((matrix) =>
      Array.from(matrix.elements)
    ),
    bindMatrixColumnMajor: Array.from(mesh.bindMatrix.elements),
    morphCount: mesh.morphTargetInfluences?.length ?? 0,
    morphTargetDictionary: mesh.morphTargetDictionary
      ? { ...mesh.morphTargetDictionary }
      : undefined,
    userData: cloneSelectedUserData(mesh.userData, meshUserDataKeys)
  };
}

/** Rebuilds the non-rendering skeleton target used by an in-worker runtime. */
export function buildShadowMmdSkinnedMesh(
  descriptor: MmdRuntimeModelDescriptor
): THREE.SkinnedMesh {
  if (descriptor.version !== 1) {
      throw new RangeError(`Unsupported MMD runtime model descriptor version: ${descriptor.version}`);
  }
  validateBoneParents(descriptor.bones);
  const bones = descriptor.bones.map((boneDescriptor) => {
    const bone = new THREE.Bone();
    bone.name = boneDescriptor.name;
    bone.position.fromArray(boneDescriptor.position);
    bone.quaternion.fromArray(boneDescriptor.quaternion);
    bone.scale.fromArray(boneDescriptor.scale);
    bone.userData = cloneRuntimeValue(boneDescriptor.userData) as Record<string, unknown>;
    return bone;
  });
  for (let index = 0; index < descriptor.bones.length; index += 1) {
    const parentIndex = descriptor.bones[index]?.parentIndex ?? -1;
    if (parentIndex >= 0) {
      const parent = bones[parentIndex];
      const bone = bones[index];
      if (!parent || !bone || parentIndex === index) {
        throw new RangeError(`Invalid MMD runtime descriptor parent: ${index}:${parentIndex}`);
      }
      parent.add(bone);
    }
  }

  const boneInverses = descriptor.boneInversesColumnMajor.map((elements) => {
    assertMatrixLength(elements, "bone inverse");
    return new THREE.Matrix4().fromArray(elements);
  });
  const skeleton = new THREE.Skeleton(bones, boneInverses);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = descriptor.name;
  mesh.userData = cloneRuntimeValue(descriptor.userData) as Record<string, unknown>;
  for (let index = 0; index < descriptor.bones.length; index += 1) {
    if ((descriptor.bones[index]?.parentIndex ?? -1) < 0) {
      const bone = bones[index];
      if (bone) {
        mesh.add(bone);
      }
    }
  }
  assertMatrixLength(descriptor.bindMatrixColumnMajor, "bind matrix");
  mesh.bind(skeleton, new THREE.Matrix4().fromArray(descriptor.bindMatrixColumnMajor));
  skeleton.boneInverses = boneInverses;
  mesh.morphTargetInfluences = new Array(descriptor.morphCount).fill(0);
  mesh.morphTargetDictionary = descriptor.morphTargetDictionary
    ? { ...descriptor.morphTargetDictionary }
    : {};
  mesh.updateWorldMatrix(false, true);
  return mesh;
}

function cloneSelectedUserData(
  source: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) {
      result[key] = cloneRuntimeValue(value);
    }
  }
  return result;
}

function cloneRuntimeValue(value: unknown): unknown {
  return structuredClone(value);
}

function assertMatrixLength(elements: readonly number[], label: string): void {
  if (elements.length !== 16) {
    throw new RangeError(`MMD runtime descriptor ${label} must contain 16 values`);
  }
}

function validateBoneParents(bones: readonly MmdRuntimeBoneDescriptor[]): void {
  for (let index = 0; index < bones.length; index += 1) {
    const parentIndex = bones[index]?.parentIndex ?? -1;
    if (!Number.isInteger(parentIndex) || parentIndex < -1 || parentIndex >= bones.length) {
      throw new RangeError(`Invalid MMD runtime descriptor parent: ${index}:${parentIndex}`);
    }
    if (parentIndex === index) {
      throw new RangeError(`Invalid MMD runtime descriptor self parent: ${index}`);
    }
    const visited = new Set<number>();
    let ancestorIndex = parentIndex;
    while (ancestorIndex >= 0) {
      if (visited.has(ancestorIndex)) {
        throw new RangeError(`MMD runtime descriptor parent cycle: ${index}:${ancestorIndex}`);
      }
      visited.add(ancestorIndex);
      ancestorIndex = bones[ancestorIndex]?.parentIndex ?? -1;
    }
  }
}
