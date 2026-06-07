import * as THREE from "three";

interface MmdMorphSplitBodyUserData {
  readonly morphTargetIndices?: Uint16Array | Uint32Array;
}

export function syncMorphSplitTargetInfluences(source: THREE.SkinnedMesh): void {
  const sourceInfluences = source.morphTargetInfluences;
  if (!sourceInfluences) {
    return;
  }
  const bodyMeshes = source.userData.mmdMorphSplitBodyMeshes;
  if (!Array.isArray(bodyMeshes)) {
    return;
  }
  for (let bodyIndex = 0; bodyIndex < bodyMeshes.length; bodyIndex += 1) {
    const body = bodyMeshes[bodyIndex];
    if (!isSkinnedMesh(body)) {
      continue;
    }
    const split = body.userData.mmdMorphSplitBody as MmdMorphSplitBodyUserData | undefined;
    const morphTargetIndices = split?.morphTargetIndices;
    const targetInfluences = body.morphTargetInfluences;
    if (!morphTargetIndices || !targetInfluences) {
      continue;
    }
    for (let index = 0; index < morphTargetIndices.length; index += 1) {
      targetInfluences[index] = sourceInfluences[morphTargetIndices[index] ?? -1] ?? 0;
    }
  }
}

function isSkinnedMesh(value: unknown): value is THREE.SkinnedMesh {
  return value instanceof THREE.SkinnedMesh || (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly isSkinnedMesh?: unknown }).isSkinnedMesh === true
  );
}
