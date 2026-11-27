import * as THREE from "three";

export function syncRuntimeMeshForRender(mesh: THREE.Object3D | undefined): void {
  if (!mesh) {
    return;
  }
  // Keep renderer-facing world and bone matrices in sync after runtime evaluation.
  mesh.updateMatrixWorld(true);
  updateSkinnedMeshSkeletons(mesh);
}

type UpdatedSkeletons = THREE.Skeleton | Set<THREE.Skeleton> | undefined;

// Most models bind all render proxies to one skeleton. Only allocate a set
// when we encounter a second skeleton, and keep it local to this traversal.
function updateSkinnedMeshSkeletons(
  object: THREE.Object3D,
  updated?: UpdatedSkeletons
): UpdatedSkeletons {
  if (isSkinnedMesh(object)) {
    const skeleton = object.skeleton;
    if (updated === undefined) {
      skeleton.update();
      updated = skeleton;
    } else if (updated !== skeleton) {
      if (!(updated instanceof Set)) {
        updated = new Set([updated]);
      }
      if (!updated.has(skeleton)) {
        updated.add(skeleton);
        skeleton.update();
      }
    }
  }
  const children = object.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child) {
      updated = updateSkinnedMeshSkeletons(child, updated);
    }
  }
  return updated;
}

export function isObject3D(value: unknown): value is THREE.Object3D {
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
