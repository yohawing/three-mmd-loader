import * as THREE from "three";

export function syncWorldMatricesToSkeleton(
  mesh: THREE.SkinnedMesh,
  matrices: Float32Array,
  worldMatrices: THREE.Matrix4[],
  parentBoneIndices: readonly number[],
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
    const parentBoneIndex = parentBoneIndices[index] ?? -1;
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

export function writeParentBoneIndices(bones: readonly THREE.Bone[], target: number[]): void {
  target.length = bones.length;
  for (let index = 0; index < bones.length; index += 1) {
    const parent = bones[index]?.parent;
    let parentIndex = -1;
    if (parent) {
      for (let candidate = 0; candidate < bones.length; candidate += 1) {
        if (bones[candidate] === parent) {
          parentIndex = candidate;
          break;
        }
      }
    }
    target[index] = parentIndex;
  }
}

export function syncMorphWeights(mesh: THREE.SkinnedMesh, weights: Float32Array): void {
  const influences = mesh.morphTargetInfluences;
  if (!influences) {
    return;
  }
  for (let index = 0; index < influences.length; index += 1) {
    influences[index] = weights[index] ?? 0;
  }
}

export function syncRuntimeObjectForRender(object: THREE.Object3D | undefined): void {
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

export function ensureScratchMatrixArrayLength(
  matrices: THREE.Matrix4[],
  length: number
): THREE.Matrix4[] {
  for (let index = matrices.length; index < length; index += 1) {
    matrices.push(new THREE.Matrix4());
  }
  matrices.length = length;
  return matrices;
}

export function isObject3D(value: unknown): value is THREE.Object3D {
  return value instanceof THREE.Object3D || hasBooleanFlag(value, "isObject3D");
}

export function isSkinnedMesh(value: THREE.Object3D): value is THREE.SkinnedMesh {
  return value instanceof THREE.SkinnedMesh || hasBooleanFlag(value, "isSkinnedMesh");
}

function hasBooleanFlag(value: unknown, key: "isObject3D" | "isSkinnedMesh"): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<typeof key, unknown>)[key] === true
  );
}
